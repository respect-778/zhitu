import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CICC_PORTAL, internshipProfile, metadataSourceIds, NVIDIA_CHINA_FACET, NVIDIA_INTERN_FACET, ROCHE_TEMPORARY_FACET } from '../config/internship-profiles.ts';
import { loadMetadataSource } from '../config/sources.ts';
import { MetadataCaptureSchema, MetadataParseError, metadataProvenance, projectMetadataRecord, readMetadataJob, type MetadataCapture } from '../adapters/internship-metadata.ts';
import { internshipListBody, readInternshipProjectMapping, TENCENT_PROJECT_MAPPING_API } from '../adapters/tencent-internship.ts';
import { createControlledJsonGetter, createControlledJsonPoster, HttpBoundaryError, type JsonGetter, type JsonPoster } from '../http/controlled-get.ts';
import { normalizeJob } from '../normalize/job.ts';
import { createPublicationPolicy } from '../storage/publication-policy.ts';
import { RuntimeConfigError } from '../runtime/config.ts';

const apiSources = ['tencent-internship', ...metadataSourceIds.filter(id => internshipProfile(id).kind === 'api')];
export function readMetadataCollectionOptions(args: string[]): { sourceId: string; target: number } {
  if (args.length !== 5 || args[0] !== '--collect-live' || args[1] !== '--source' || !apiSources.includes(args[2]) ||
      args[3] !== '--target' || !/^[1-9][0-9]*$/.test(args[4]) || Number(args[4]) > 400) {
    throw new RuntimeConfigError('INVALID_ARGUMENTS', 'Use --collect-live --source FIXED_API_SOURCE --target 1..400.');
  }
  return { sourceId: args[2], target: Number(args[4]) };
}
export function metadataListRequest(sourceId: string, page: number): { url: string; body?: string; pageSize: number; maxPages: number } {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('METADATA_PAGE_INVALID');
  if (sourceId === 'tencent-internship') {
    return { url: metadataProvenance(sourceId).sourceUrl, body: internshipListBody(page), pageSize: 100, maxPages: 6 };
  }
  const profile = internshipProfile(sourceId);
  if (sourceId === 'xiaomi-internship') {
    if (page > 10) throw new Error('METADATA_PAGE_INVALID');
    const query = new URLSearchParams({ keyword: '', cityZhNames: '', pageSize: '100', pageNum: String(page), type: '3' });
    return { url: `${profile.sourceUrl}?${query}`, pageSize: 100, maxPages: 10 };
  }
  if (sourceId === 'cicc-internship') {
    if (page > 10) throw new Error('METADATA_PAGE_INVALID');
    return { url: profile.sourceUrl, pageSize: 100, maxPages: 10,
      body: JSON.stringify({ Category: [3], DisplayFields: ['Category', 'Kind', 'LocId', 'Org', 'HeadCount', 'Station', 'EndTime', 'PostDate', 'Salary', 'ClassificationOne', 'ClassificationTwo'],
        PageIndex: page - 1, PageSize: 100, PortalId: CICC_PORTAL }) };
  }
  if (sourceId !== 'nvidia-china-internship' && sourceId !== 'roche-china-internship') throw new Error('METADATA_SOURCE_INVALID');
  if (page > 50) throw new Error('METADATA_PAGE_INVALID');
  const nvidia = sourceId === 'nvidia-china-internship';
  return { url: profile.sourceUrl, pageSize: 20, maxPages: 50,
    body: JSON.stringify({ appliedFacets: nvidia
      ? { workerSubType: [NVIDIA_INTERN_FACET], locationHierarchy1: [NVIDIA_CHINA_FACET] }
      : { workerSubType: [ROCHE_TEMPORARY_FACET] }, limit: 20, offset: (page - 1) * 20, searchText: nvidia ? '' : '实习' }) };
}
export function readMetadataList(sourceId: string, input: unknown, pageSize: number): { total: number; rows: unknown[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MetadataParseError();
  const response = input as Record<string, unknown>;
  const data = response.data as Record<string, unknown> | null | undefined;
  let total: unknown, rows: unknown;
  switch (sourceId) {
    case 'tencent-internship':
      if (response.status !== 0) throw new MetadataParseError();
      total = data?.count; rows = data?.positionList; break;
    case 'xiaomi-internship':
      if (response.code !== 0) throw new MetadataParseError();
      total = data?.total; rows = data?.list; break;
    case 'cicc-internship':
      if (response.Code !== 200) throw new MetadataParseError();
      total = response.Count; rows = response.Data; break;
    case 'nvidia-china-internship':
    case 'roche-china-internship': total = response.total; rows = response.jobPostings; break;
    default: throw new MetadataParseError();
  }
  if (!Number.isSafeInteger(total) || (total as number) < 0 || !Array.isArray(rows) || rows.length > pageSize) throw new MetadataParseError();
  return { total: total as number, rows };
}
function listIdentity(sourceId: string, input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  let value: unknown;
  switch (sourceId) {
    case 'tencent-internship': value = row.postId; break;
    case 'xiaomi-internship': value = row.jobPostId; break;
    case 'cicc-internship': value = row.Id; break;
    default: value = Array.isArray(row.bulletFields) ? row.bulletFields[0] : undefined;
  }
  return typeof value === 'string' && value.length > 0 ? value : null;
}
interface Transport { get: JsonGetter; post: JsonPoster }
const retryable = new Set(['HTTP_DNS_FAILED', 'HTTP_REQUEST_FAILED', 'HTTP_RESPONSE_FAILED', 'HTTP_CONNECT_TIMEOUT', 'HTTP_READ_TIMEOUT', 'HTTP_TOTAL_TIMEOUT']);
export async function collectInternshipMetadata(options: { sourceId: string; target: number }, injected?: Transport) {
  readMetadataCollectionOptions(['--collect-live', '--source', options.sourceId, '--target', String(options.target)]);
  const source = await loadMetadataSource(options.sourceId);
  const transport = injected ?? { get: createControlledJsonGetter({ allowedHosts: source.allowedHosts, maxRedirects: 0 }),
    post: createControlledJsonPoster({ allowedHosts: source.allowedHosts, maxRedirects: 0 }) };
  const policy = createPublicationPolicy([source]);
  let nextRequestAt = 0;
  const request = async (url: string, body?: string) => {
    for (let attempt = 0; ; attempt++) {
      if (!injected) { await delay(Math.max(0, nextRequestAt - Date.now())); nextRequestAt = Date.now() + 1000; }
      try { return body === undefined ? await transport.get(url) : await transport.post(url, body); }
      catch (error) {
        if (attempt === 0 && error instanceof HttpBoundaryError && retryable.has(error.code)) continue;
        throw error;
      }
    }
  };
  const records: unknown[] = [];
  const seen = new Set<string>();
  const listedIds = new Set<string>();
  const pageSignatures = new Set<string>();
  const workday = options.sourceId === 'nvidia-china-internship' || options.sourceId === 'roche-china-internship';
  let rejected = 0, excluded = 0, duplicateIds = 0, pagesRead = 0;
  let reportedTotal: number | null = null;
  let stopReason: NonNullable<MetadataCapture['report']>['stopReason'] = 'max_pages';
  try {
    if (options.sourceId === 'tencent-internship') readInternshipProjectMapping(await request(TENCENT_PROJECT_MAPPING_API));
    for (let page = 1; ; page++) {
      const operation = metadataListRequest(options.sourceId, page);
      let response: unknown;
      try { response = await request(operation.url, operation.body); }
      catch { stopReason = 'request_failed'; break; }
      let list;
      try { list = readMetadataList(options.sourceId, response, operation.pageSize); }
      catch { stopReason = 'parse_failed'; break; }
      pagesRead++;
      if (reportedTotal === null) reportedTotal = list.total;
      // Workday omits the total on populated continuation pages. The first page remains authoritative.
      const pageTotal: number = workday && page > 1 && list.total === 0 && list.rows.length > 0 ? reportedTotal : list.total;
      if (pageTotal !== reportedTotal || list.rows.length !== Math.max(0, Math.min(operation.pageSize, pageTotal - (page - 1) * operation.pageSize))) {
        stopReason = 'total_mismatch'; break;
      }
      const identities = list.rows.map(row => listIdentity(source.sourceId, row));
      const signature = JSON.stringify(identities);
      const repeatedPage = list.rows.length > 0 && pageSignatures.has(signature);
      const sourceProgress = identities.some(id => id !== null && !listedIds.has(id));
      pageSignatures.add(signature);
      for (const id of identities) if (id !== null) listedIds.add(id);
      for (const raw of list.rows) {
        try {
          const projected = projectMetadataRecord(source.sourceId, raw);
          const job = normalizeJob(readMetadataJob(source, projected, new Date().toISOString()), source).job;
          policy.assertPublishable(job);
          if (seen.has(job.sourceJobId)) { duplicateIds++; continue; }
          seen.add(job.sourceJobId); records.push(projected);
        } catch (error) {
          if (error instanceof MetadataParseError && error.code === 'OUTSIDE_SCOPE') excluded++; else rejected++;
        }
        if (records.length === options.target) break;
      }
      if (records.length === options.target) { stopReason = 'target_reached'; break; }
      if (repeatedPage || (page > 1 && list.rows.length > 0 && !sourceProgress)) { stopReason = 'repeated_page'; break; }
      if (page * operation.pageSize >= pageTotal) { stopReason = 'source_exhausted'; break; }
      if (page >= operation.maxPages) break;
    }
  } catch { stopReason = 'parse_failed'; }
  return MetadataCaptureSchema.parse({ mode: 'internship-metadata-v1', synthetic: Boolean(injected), persisted: false, sourceId: source.sourceId,
    observedAt: new Date().toISOString(), provenance: metadataProvenance(source.sourceId), records,
    report: { target: options.target, accepted: records.length, rejected, excluded, duplicateIds, pagesRead, reportedTotal,
      targetReached: records.length >= options.target, coverageComplete: false, stopReason } });
}
async function main() {
  const options = readMetadataCollectionOptions(process.argv.slice(2));
  const capture = await collectInternshipMetadata(options);
  process.stdout.write(`${JSON.stringify(capture)}\n`);
  if (!capture.report?.targetReached) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({ code: 'METADATA_COLLECTION_FAILED', message: 'Internship metadata collection did not complete.' })}\n`);
  });
}
