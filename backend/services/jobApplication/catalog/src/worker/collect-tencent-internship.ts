import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { internshipDetailApiUrl, internshipListBody, readInternshipDetail, readInternshipList, readInternshipPost,
  readInternshipProjectMapping, TENCENT_INTERNSHIP_LIST_API, TENCENT_PROJECT_MAPPING_API } from '../adapters/tencent-internship.ts';
import { loadTencentInternshipSource } from '../config/sources.ts';
import { createControlledJsonGetter, createControlledJsonPoster, HttpBoundaryError, type JsonGetter, type JsonPoster } from '../http/controlled-get.ts';
import { normalizeJob } from '../normalize/job.ts';
import { createPublicationPolicy } from '../storage/publication-policy.ts';
import { RuntimeConfigError } from '../runtime/config.ts';
import { MAX_INTERNSHIP_CAPTURE_BYTES } from './capture.ts';
import { InternshipCaptureSchema, type InternshipCapture } from './internship-capture.ts';

export function readInternshipCollectionOptions(args: string[]): { target: number } {
  if (args.length !== 5 || args[0] !== '--collect-live' || args[1] !== '--source' || args[2] !== 'tencent-internship' ||
      args[3] !== '--target' || !/^[1-9][0-9]*$/.test(args[4]) || Number(args[4]) > 500) {
    throw new RuntimeConfigError('INVALID_ARGUMENTS', 'Use --collect-live --source tencent-internship --target 1..500.');
  }
  return { target: Number(args[4]) };
}
interface Transport { get: JsonGetter; post: JsonPoster }
const retryable = new Set(['HTTP_DNS_FAILED', 'HTTP_REQUEST_FAILED', 'HTTP_RESPONSE_FAILED', 'HTTP_CONNECT_TIMEOUT', 'HTTP_READ_TIMEOUT', 'HTTP_TOTAL_TIMEOUT']);

/** At most six 100-row pages, 600 details and one network retry, with one live request per second. */
export async function collectTencentInternships(options: { target: number }, injected?: Transport,
  progress: (accepted: number) => void = () => {}) {
  readInternshipCollectionOptions(['--collect-live', '--source', 'tencent-internship', '--target', String(options.target)]);
  const source = await loadTencentInternshipSource();
  const transport = injected ?? { get: createControlledJsonGetter({ allowedHosts: source.allowedHosts, maxRedirects: 0 }),
    post: createControlledJsonPoster({ allowedHosts: source.allowedHosts, maxRedirects: 0 }) };
  const policy = createPublicationPolicy([source]);
  const startedAt = new Date().toISOString();
  const pages: InternshipCapture['pages'] = [], records: InternshipCapture['records'] = [], failures: InternshipCapture['failures'] = [];
  const seen = new Set<string>();
  let projectMapping: unknown = null;
  let recordsSeen = 0, excluded = 0, invalidPosts = 0, duplicateIds = 0, requestFailures = 0, requestAttempts = 0;
  let reportedTotal: number | null = null, nextRequestAt = 0;
  // Reserve space for the fixed envelope, up to 600 failure summaries and punctuation.
  const payloadLimit = MAX_INTERNSHIP_CAPTURE_BYTES - 256 * 1024;
  let capturedBytes = 0;
  let stopReason: InternshipCapture['report']['stopReason'] = 'max_pages';
  const request = async (operation: () => Promise<unknown>) => {
    for (let attempt = 0; ; attempt++) {
      if (!injected) { await delay(Math.max(0, nextRequestAt - Date.now())); nextRequestAt = Date.now() + 1000; }
      requestAttempts++;
      try { return await operation(); }
      catch (error) {
        if (attempt === 0 && error instanceof HttpBoundaryError && retryable.has(error.code)) continue;
        requestFailures++; throw error;
      }
    }
  };
  try {
    projectMapping = await request(() => transport.get(TENCENT_PROJECT_MAPPING_API));
    readInternshipProjectMapping(projectMapping);
    capturedBytes = Buffer.byteLength(JSON.stringify(projectMapping), 'utf8');
  }
  catch (error) { stopReason = error instanceof HttpBoundaryError ? 'request_failed' : 'parse_failed'; }
  if (projectMapping !== null && stopReason === 'max_pages') {
    pageLoop: for (let pageIndex = 1; pageIndex <= 6; pageIndex++) {
      let response: unknown;
      try { response = await request(() => transport.post(TENCENT_INTERNSHIP_LIST_API, internshipListBody(pageIndex))); }
      catch { stopReason = 'request_failed'; break; }
      let list;
      try { list = readInternshipList(response); } catch { stopReason = 'parse_failed'; break; }
      const page = { pageIndex, response };
      const pageBytes = Buffer.byteLength(JSON.stringify(page), 'utf8');
      if (capturedBytes + pageBytes > payloadLimit) { stopReason = 'capture_limit'; break; }
      pages.push(page); capturedBytes += pageBytes;
      if (reportedTotal === null) reportedTotal = list.total;
      const pending: { raw: unknown; post: NonNullable<ReturnType<typeof readInternshipPost>> }[] = [];
      for (const raw of list.posts) {
        recordsSeen++;
        let post;
        try { post = readInternshipPost(raw); } catch { invalidPosts++; continue; }
        if (post === null) { excluded++; continue; }
        if (seen.has(post.id)) { duplicateIds++; continue; }
        seen.add(post.id); pending.push({ raw, post });
      }
      const expected = Math.max(0, Math.min(100, list.total - (pageIndex - 1) * 100));
      if (list.total !== reportedTotal || list.posts.length !== expected) { stopReason = 'total_mismatch'; break; }
      if (duplicateIds) { stopReason = 'repeated_page'; break; }
      for (const { raw, post } of pending) {
        let detail: unknown;
        try { detail = await request(() => transport.get(internshipDetailApiUrl(post.id))); }
        catch { failures.push({ sourceJobId: post.id, reason: 'request_failed' }); continue; }
        const observedAt = new Date().toISOString();
        try {
          const normalized = normalizeJob(readInternshipDetail(detail, post, source, observedAt), source);
          policy.assertPublishable(normalized.job);
        } catch { failures.push({ sourceJobId: post.id, reason: 'parse_failed' }); continue; }
        const row = { post: raw, detail, observedAt };
        const rowBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
        if (capturedBytes + rowBytes > payloadLimit) {
          failures.push({ sourceJobId: post.id, reason: 'capture_limit' }); stopReason = 'capture_limit'; break pageLoop;
        }
        records.push(row); capturedBytes += rowBytes;
        progress(records.length);
        if (records.length === options.target) { stopReason = 'target_reached'; break pageLoop; }
      }
      if (pageIndex * 100 >= list.total) { stopReason = 'source_exhausted'; break; }
    }
  }
  const result = InternshipCaptureSchema.parse({ mode: 'tencent-internship', synthetic: Boolean(injected), persisted: false,
    source, projectMapping, pages, records, failures,
    report: { runId: `tencent-internship-${randomUUID()}`, sourceId: source.sourceId, scopeKey: source.scopeKey,
      startedAt, finishedAt: new Date().toISOString(), target: options.target, targetReached: records.length === options.target,
      status: records.length ? 'partial' : 'failed', coverageComplete: false, stopReason,
      pagesRead: pages.length, recordsSeen, accepted: records.length, excluded, invalidPosts, duplicateIds,
      rejected: invalidPosts + failures.length, unprocessed: seen.size - records.length - failures.length,
      detailsAttempted: records.length + failures.length, requestFailures, requestAttempts, reportedTotal } });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') + 1 > MAX_INTERNSHIP_CAPTURE_BYTES) {
    throw new RuntimeConfigError('CAPTURE_LIMIT', 'Internship capture exceeds the bounded input size.');
  }
  return result;
}
async function main() {
  const options = readInternshipCollectionOptions(process.argv.slice(2));
  const result = await collectTencentInternships(options, undefined, accepted => {
    if (accepted % 25 === 0) process.stderr.write(`${JSON.stringify({ mode: 'tencent-internship-progress', accepted, target: options.target })}\n`);
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.report.targetReached) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({ code: error instanceof RuntimeConfigError ? error.code : 'INTERNSHIP_COLLECTION_FAILED', message: 'Internship collection did not complete.' })}\n`);
  });
}
