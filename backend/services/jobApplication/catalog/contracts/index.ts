import { array, boolean, checked, count, enumeration, ensure, identifier, instant, nullable, object, type Infer } from './validation.ts';
import { EvidenceSchema, JobReferenceSchema } from './records.ts';
export * from './records.ts';
export * from './search.ts';
export * from './artifacts.ts';
export { ContractError } from './validation.ts';

export const StopReasonSchema = enumeration([
  'exhausted', 'more_pages', 'max_pages', 'request_failed', 'parse_failed',
  'repeated_page', 'total_mismatch', 'scope_mismatch', 'cancelled', 'unknown_end',
]);
export type StopReason = Infer<typeof StopReasonSchema>;
export const RunStatusSchema = enumeration(['running', 'complete', 'partial', 'failed', 'cancelled']);
export type RunStatus = Infer<typeof RunStatusSchema>;

export const ExclusionSchema = checked(object({
  reason: enumeration(['outside_scope']), count, ruleId: identifier, evidence: EvidenceSchema,
}), (exclusion, path) => {
  ensure(exclusion.count > 0, `${path}.count`, 'an exclusion group must account for actual records');
  ensure(exclusion.evidence.locator !== undefined, `${path}.evidence.locator`, 'exclusion evidence must locate the source fields used by the scope rule');
});
export type Exclusion = Infer<typeof ExclusionSchema>;
const exclusionFields = { excluded: count, exclusions: array(ExclusionSchema) };
function checkExclusions(value: { excluded: number; exclusions: Exclusion[] }, path: string) {
  const explained = value.exclusions.reduce((sum, group) => sum + group.count, 0);
  ensure(Number.isSafeInteger(explained) && explained === value.excluded, `${path}.exclusions`, 'every excluded record needs a counted scope rule and evidence');
}

export const ListPageSchema = checked(object({
  sourceId: identifier, scopeKey: identifier, items: array(JobReferenceSchema),
  ...exclusionFields,
  // Source-reported total before local exclusions, never rewritten to the retained item count.
  reportedTotal: nullable(count), nextCursor: nullable(identifier), hasMore: nullable(boolean),
  completeness: enumeration(['complete', 'partial']), stopReason: StopReasonSchema,
}), (page, path) => {
  checkExclusions(page, path);
  for (const item of page.items) ensure(item.sourceId === page.sourceId, `${path}.items`, 'item belongs to another source');
  const ids = page.items.map(item => item.sourceJobId);
  ensure(new Set(ids).size === ids.length, `${path}.items`, 'duplicate sourceJobId in page');
  ensure(page.reportedTotal === null || page.items.length + page.excluded <= page.reportedTotal, `${path}.reportedTotal`, 'page including excluded records exceeds reported total');
  ensure(page.hasMore !== false || page.nextCursor === null, `${path}.nextCursor`, 'terminal page cannot carry a next cursor');
  ensure(page.hasMore !== true || page.nextCursor !== null, `${path}.nextCursor`, 'continuation requires a next cursor');
  if (page.completeness === 'complete') {
    ensure(page.stopReason === 'exhausted' && page.hasMore === false && page.nextCursor === null,
      path, 'complete requires proven exhaustion, never a limit or unknown ending');
  } else {
    ensure(page.stopReason !== 'exhausted', `${path}.stopReason`, 'partial needs a reason other than exhaustion');
    if (page.stopReason === 'more_pages') ensure(page.hasMore === true, `${path}.hasMore`, 'more_pages requires confirmed continuation');
  }
});
export type ListPage = Infer<typeof ListPageSchema>;

export const RunReportSchema = checked(object({
  runId: identifier, sourceId: identifier, scopeKey: identifier, status: RunStatusSchema,
  startedAt: instant, finishedAt: nullable(instant), pagesRead: count,
  recordsSeen: count, accepted: count, rejected: count, duplicateIds: count, requestFailures: count,
  ...exclusionFields,
  // Same pre-exclusion total as ListPage; unknown remains null.
  reportedTotal: nullable(count), nextCursor: nullable(identifier), hasMore: nullable(boolean),
  coverageComplete: boolean, stopReason: nullable(StopReasonSchema),
}), (run, path) => {
  checkExclusions(run, path);
  const accounted = run.accepted + run.rejected + run.duplicateIds + run.excluded;
  ensure(Number.isSafeInteger(accounted) && accounted <= run.recordsSeen, path, 'record accounting exceeds recordsSeen');
  ensure(run.pagesRead > 0 || run.recordsSeen === 0, `${path}.pagesRead`, 'records require a page');
  ensure(run.finishedAt === null || Date.parse(run.finishedAt) >= Date.parse(run.startedAt), `${path}.finishedAt`, 'run ends before it starts');
  ensure(run.hasMore !== false || run.nextCursor === null, `${path}.nextCursor`, 'terminal pagination cannot carry a cursor');
  ensure(run.hasMore !== true || run.nextCursor !== null, `${path}.nextCursor`, 'continuation requires a cursor');
  ensure(run.coverageComplete === (run.status === 'complete'), `${path}.coverageComplete`, 'coverageComplete must match complete status');
  if (run.status === 'running') {
    ensure(run.finishedAt === null && run.stopReason === null, path, 'running reports cannot have terminal fields');
    return;
  }
  ensure(run.finishedAt !== null && run.stopReason !== null, path, 'finished runs require a timestamp and stop reason');
  ensure(accounted === run.recordsSeen, path, 'finished runs must account for every record exactly once');
  ensure((run.status === 'cancelled') === (run.stopReason === 'cancelled'), path, 'cancelled status and reason must agree');
  if (run.status === 'complete') {
    ensure(run.stopReason === 'exhausted' && run.pagesRead > 0 && run.hasMore === false && run.nextCursor === null,
      path, 'complete requires actual pages and proven exhaustion');
    ensure(run.rejected === 0 && run.duplicateIds === 0 && run.requestFailures === 0,
      path, 'rejected records, duplicate identities, or request failures prevent complete coverage');
    ensure(run.reportedTotal === null || run.accepted + run.excluded === run.reportedTotal,
      `${path}.reportedTotal`, 'accepted plus evidenced exclusions must match the source total');
  } else {
    ensure(run.stopReason !== 'exhausted', `${path}.stopReason`, 'incomplete runs require an explicit incomplete reason');
    ensure(run.stopReason !== 'more_pages', `${path}.stopReason`, 'a stopped run must explain why continuation stopped');
  }
});
export type RunReport = Infer<typeof RunReportSchema>;
