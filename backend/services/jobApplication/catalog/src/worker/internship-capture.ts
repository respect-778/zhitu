import { SourceConfigSchema } from '../../contracts/index.ts';
import { array, boolean, checked, count, enumeration, ensure, identifier, instant, nullable, object, type Infer } from '../../contracts/validation.ts';
import { readInternshipDetail, readInternshipList, readInternshipPost, readInternshipProjectMapping } from '../adapters/tencent-internship.ts';
import { assertTencentInternshipSource } from '../config/sources.ts';
import { normalizeJob } from '../normalize/job.ts';
import { createPublicationPolicy } from '../storage/publication-policy.ts';
import { CaptureError, MAX_INTERNSHIP_CAPTURE_BYTES } from './capture.ts';

const rawJson = { parse(input: unknown): unknown { return input; } };
export const InternshipReportSchema = checked(object({
  runId: identifier, sourceId: identifier, scopeKey: identifier, startedAt: instant, finishedAt: instant,
  target: count, targetReached: boolean, status: enumeration(['partial', 'failed']), coverageComplete: boolean,
  stopReason: enumeration(['target_reached', 'max_pages', 'source_exhausted', 'request_failed', 'parse_failed', 'total_mismatch', 'repeated_page', 'capture_limit']),
  pagesRead: count, recordsSeen: count, accepted: count, excluded: count, invalidPosts: count,
  duplicateIds: count, rejected: count, unprocessed: count, detailsAttempted: count, requestFailures: count, requestAttempts: count,
  reportedTotal: nullable(count),
}), (report, path) => {
  ensure(report.target >= 1 && report.target <= 500 && report.accepted <= report.target, path, 'invalid target');
  ensure(report.targetReached === (report.accepted === report.target) && (report.stopReason === 'target_reached') === report.targetReached, path, 'target accounting differs');
  ensure(report.coverageComplete === false && report.pagesRead <= 6 && report.detailsAttempted <= 600 && report.requestAttempts <= 1214, path, 'bounded partial collection required');
  ensure(report.requestAttempts >= 1 + report.pagesRead + report.detailsAttempted && report.requestFailures <= report.requestAttempts,
    path, 'request accounting omits required operations');
  ensure(Date.parse(report.finishedAt) >= Date.parse(report.startedAt), path, 'invalid timestamps');
  ensure(report.recordsSeen === report.accepted + report.excluded + report.duplicateIds + report.rejected + report.unprocessed, path, 'invalid record accounting');
});
export const InternshipCaptureSchema = object({
  mode: enumeration(['tencent-internship']), synthetic: boolean, persisted: boolean, source: SourceConfigSchema,
  projectMapping: rawJson,
  pages: array(object({ pageIndex: count, response: rawJson })),
  records: array(object({ post: rawJson, detail: rawJson, observedAt: instant })),
  failures: array(object({ sourceJobId: identifier, reason: enumeration(['request_failed', 'parse_failed', 'review_required', 'capture_limit']) })),
  report: InternshipReportSchema,
});
export type InternshipCapture = Infer<typeof InternshipCaptureSchema>;

/** Reparse original official payloads. Ingestion accepts only explicit internship records. */
export function parseTencentInternshipCapture(input: unknown, trustedInput: unknown) {
  try {
    const source = assertTencentInternshipSource(trustedInput);
    const value = InternshipCaptureSchema.parse(input);
    if (value.synthetic !== false) throw new CaptureError('SYNTHETIC_CAPTURE');
    if (value.persisted !== false || JSON.stringify(value.source) !== JSON.stringify(source) ||
        value.report.sourceId !== source.sourceId || value.report.scopeKey !== source.scopeKey ||
        value.records.length !== value.report.accepted || value.pages.length !== value.report.pagesRead ||
        Buffer.byteLength(JSON.stringify(value), 'utf8') + 1 > MAX_INTERNSHIP_CAPTURE_BYTES) throw new CaptureError('CAPTURE_INVALID');
    readInternshipProjectMapping(value.projectMapping);
    const listed = new Map<string, ReturnType<typeof readInternshipPost>>();
    let seen = 0, excluded = 0, invalid = 0, duplicates = 0;
    for (const [index, page] of value.pages.entries()) {
      if (page.pageIndex !== index + 1) throw new CaptureError('CAPTURE_INVALID');
      const list = readInternshipList(page.response);
      if (index === 0 && list.total !== value.report.reportedTotal) throw new CaptureError('CAPTURE_INVALID');
      for (const raw of list.posts) {
        seen++;
        let post;
        try { post = readInternshipPost(raw); } catch { invalid++; continue; }
        if (post === null) { excluded++; continue; }
        if (listed.has(post.id)) { duplicates++; continue; }
        listed.set(post.id, post);
      }
    }
    const policy = createPublicationPolicy([source]);
    const accepted = new Set<string>();
    const jobs = value.records.map(row => {
      const post = readInternshipPost(row.post);
      if (post === null || !listed.has(post.id) || accepted.has(post.id) ||
          JSON.stringify(post) !== JSON.stringify(listed.get(post.id)) ||
          Date.parse(row.observedAt) < Date.parse(value.report.startedAt) || Date.parse(row.observedAt) > Date.parse(value.report.finishedAt)) throw new CaptureError('CAPTURE_INVALID');
      accepted.add(post.id);
      const normalized = normalizeJob(readInternshipDetail(row.detail, post, source, row.observedAt), source);
      return policy.assertPublishable(normalized.job);
    });
    const failed = new Set<string>();
    for (const failure of value.failures) {
      if (!listed.has(failure.sourceJobId) || accepted.has(failure.sourceJobId) || failed.has(failure.sourceJobId)) throw new CaptureError('CAPTURE_INVALID');
      failed.add(failure.sourceJobId);
    }
    const report = value.report;
    const detailRequestFailures = value.failures.filter(failure => failure.reason === 'request_failed').length;
    const captureLimitFailures = value.failures.filter(failure => failure.reason === 'capture_limit').length;
    // A terminal list response is absent after a request/parse failure or a page-size cap.
    // A detail-size cap already accounts for its request in detailsAttempted.
    const terminalListRequest = report.stopReason === 'request_failed' || report.stopReason === 'parse_failed' ||
      (report.stopReason === 'capture_limit' && captureLimitFailures === 0);
    const operations = 1 + report.pagesRead + report.detailsAttempted + Number(terminalListRequest);
    if (report.requestAttempts < operations || report.requestAttempts > operations * 2 ||
        report.requestFailures !== detailRequestFailures + Number(report.stopReason === 'request_failed') ||
        captureLimitFailures > 1 || (captureLimitFailures === 1 &&
          (report.stopReason !== 'capture_limit' || value.failures.at(-1)?.reason !== 'capture_limit'))) throw new CaptureError('CAPTURE_INVALID');
    if (report.recordsSeen !== seen || report.excluded !== excluded || report.invalidPosts !== invalid || report.duplicateIds !== duplicates ||
        report.rejected !== invalid + failed.size || report.detailsAttempted !== jobs.length + failed.size ||
        report.unprocessed !== listed.size - jobs.length - failed.size ||
        (report.status === 'failed') !== (jobs.length === 0)) throw new CaptureError('CAPTURE_INVALID');
    return { source, jobs, collectionReport: report };
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('CAPTURE_INVALID');
  }
}
