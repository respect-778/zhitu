import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, parse } from 'node:path';
import { ListPageSchema, RunReportSchema, SourceConfigSchema, type ListPage, type RunReport, type SourceConfig } from '../../contracts/index.ts';
import { MAX_INGEST_RECORDS, normalizeJob } from '../normalize/job.ts';

export class CaptureError extends Error {
  readonly code: 'INVALID_ARGUMENTS' | 'INPUT_PATH_REJECTED' | 'INPUT_FILE_INVALID' | 'CAPTURE_INVALID' | 'SYNTHETIC_CAPTURE' | 'PLATFORM_UNSUPPORTED';
  constructor(code: CaptureError['code']) { super(code); this.name = 'CaptureError'; this.code = code; }
}
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const MAX_INTERNSHIP_CAPTURE_BYTES = 32 * 1024 * 1024;

export function readIngestOptions(args: string[]): { input: string } {
  if (args.length !== 4 || args[0] !== '--source' || args[1] !== 'tencent-native' || args[2] !== '--input') throw new CaptureError('INVALID_ARGUMENTS');
  checkInputPath(args[3]);
  return { input: args[3] };
}

export function checkInputPath(input: string): void {
  if (typeof input !== 'string' || input.length > 1024 || !isAbsolute(input) || normalize(input) !== input ||
      !/^[\p{L}\p{N}_ .:/\\-]+$/u.test(input) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(parse(input).base)) throw new CaptureError('INPUT_PATH_REJECTED');
  const segments = input.replace(/\\/g, '/').toLowerCase().split('/');
  if (segments.some(segment => segment.startsWith('.') || /(?:^|[._-])(?:env|private|secret|secrets|credential|credentials|password|token|tokens|auth|key|keys)(?:$|[._-])/.test(segment)) ||
      /^(?:\/proc|\/sys|\/dev|\/etc|\/run|\/var\/run)(?:\/|$)/.test(input) ||
      input.includes(':', /^[A-Za-z]:/.test(input) ? 2 : 0)) throw new CaptureError('INPUT_PATH_REJECTED');
}

/** Linux-only, bounded regular-file reader. The deployment mounts exactly one capture read-only. */
export async function readCaptureFile(input: string): Promise<unknown> {
  return readBoundedCaptureFile(input, MAX_CAPTURE_BYTES);
}
/** Raw internship details can include full department lists. The legacy limit stays at 8 MiB. */
export async function readInternshipCaptureFile(input: string): Promise<unknown> {
  return readBoundedCaptureFile(input, MAX_INTERNSHIP_CAPTURE_BYTES);
}
async function readBoundedCaptureFile(input: string, maximumBytes: number): Promise<unknown> {
  checkInputPath(input);
  if (process.platform !== 'linux') throw new CaptureError('PLATFORM_UNSUPPORTED');
  try {
    let cursor = input;
    while (true) {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() || (cursor === input ? !info.isFile() : !info.isDirectory())) throw new CaptureError('INPUT_FILE_INVALID');
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    if (await realpath(input) !== input) throw new CaptureError('INPUT_FILE_INVALID');
    const file = await open(input, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      if (!before.isFile() || before.size === 0 || before.size > maximumBytes) throw new CaptureError('INPUT_FILE_INVALID');
      const buffer = Buffer.alloc(before.size + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
        if (!bytesRead) break;
        total += bytesRead;
      }
      const after = await file.stat();
      if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino) throw new CaptureError('INPUT_FILE_INVALID');
      // Fatal UTF-8 decoding catches replacement characters introduced by broken input bytes.
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total)));
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('INPUT_FILE_INVALID');
  }
}

/** A complete claim requires the saved Tencent page sequence itself to prove exhaustion. */
function assertCompleteEvidence(report: RunReport, pages: ListPage[], listedCount: number): void {
  if (report.status !== 'complete') return;
  const excluded = pages.reduce((sum, page) => sum + page.excluded, 0);
  if (!pages.length || pages.length !== report.pagesRead || report.reportedTotal === null ||
      listedCount !== report.accepted || excluded !== report.excluded || listedCount + excluded !== report.recordsSeen ||
      JSON.stringify(pages.flatMap(page => page.exclusions)) !== JSON.stringify(report.exclusions)) throw new CaptureError('CAPTURE_INVALID');
  for (const [index, page] of pages.entries()) {
    if (page.reportedTotal !== report.reportedTotal) throw new CaptureError('CAPTURE_INVALID');
    const last = index === pages.length - 1;
    if (last ? page.completeness !== 'complete' || page.stopReason !== 'exhausted' || page.hasMore !== false || page.nextCursor !== null
      : page.completeness !== 'partial' || page.stopReason !== 'more_pages' || page.hasMore !== true || page.nextCursor !== String(index + 2)) {
      throw new CaptureError('CAPTURE_INVALID');
    }
  }
}

export function parseTencentCapture(input: unknown, trustedInput: SourceConfig) {
  try {
    const trusted = SourceConfigSchema.parse(trustedInput);
    if (trusted.sourceId !== 'tencent-native' || trusted.adapter !== 'tencent' || trusted.kind !== 'enterprise' || trusted.scopeKey !== 'tencent:native:all-categories:zh-cn') throw new CaptureError('CAPTURE_INVALID');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new CaptureError('CAPTURE_INVALID');
    const keys = ['mode', 'synthetic', 'persisted', 'source', 'jobs', 'pages', 'report', 'attempts'];
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !keys.includes(key) || !('value' in descriptors[key]))) throw new CaptureError('CAPTURE_INVALID');
    const value = input as Record<string, unknown>;
    if (value.synthetic !== false) throw new CaptureError('SYNTHETIC_CAPTURE');
    if (value.mode !== 'tencent' || value.persisted !== false || JSON.stringify(SourceConfigSchema.parse(value.source)) !== JSON.stringify(trusted) ||
        !Array.isArray(value.jobs) || value.jobs.length > MAX_INGEST_RECORDS || !Array.isArray(value.pages) || value.pages.length > 1000) throw new CaptureError('CAPTURE_INVALID');
    const report = RunReportSchema.parse(value.report);
    if (report.sourceId !== trusted.sourceId || report.scopeKey !== trusted.scopeKey || report.status === 'running' || report.accepted !== value.jobs.length) throw new CaptureError('CAPTURE_INVALID');
    const pages = value.pages.map(page => ListPageSchema.parse(page));
    if (pages.length > report.pagesRead || pages.some(page => page.sourceId !== trusted.sourceId || page.scopeKey !== trusted.scopeKey)) throw new CaptureError('CAPTURE_INVALID');
    const listed = new Map<string, string | null>();
    for (const page of pages) for (const item of page.items) {
      if (listed.has(item.sourceJobId)) throw new CaptureError('CAPTURE_INVALID');
      listed.set(item.sourceJobId, item.detailUrl);
    }
    if (listed.size > report.recordsSeen - report.excluded - report.duplicateIds) throw new CaptureError('CAPTURE_INVALID');
    assertCompleteEvidence(report, pages, listed.size);
    const acceptedIds = new Set<string>();
    for (const raw of value.jobs) {
      let normalized: ReturnType<typeof normalizeJob>;
      try { normalized = normalizeJob(raw, trusted); }
      catch { continue; } // The same normalizer rejects this exact row during per-item ingestion, preserving its index/count.
      const job = normalized.job;
      if (acceptedIds.has(job.sourceJobId) || !listed.has(job.sourceJobId) || listed.get(job.sourceJobId) !== job.detailUrl) {
        throw new CaptureError('CAPTURE_INVALID');
      }
      acceptedIds.add(job.sourceJobId);
    }
    return { source: trusted, jobs: value.jobs as unknown[], collectionReport: report };
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('CAPTURE_INVALID');
  }
}
