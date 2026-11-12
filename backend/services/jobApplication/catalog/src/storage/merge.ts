import { JobSchema, type Job } from '../../contracts/index.ts';
import { jobReviewReasons } from '../normalize/job.ts';

export const MAX_MERGED_EVIDENCE = 128;
export class MergeEvidenceError extends Error {
  readonly code = 'EVIDENCE_LIMIT_EXCEEDED';
  constructor() { super('Evidence requires review before another partial merge.'); this.name = 'MergeEvidenceError'; }
}

/** Called only after the source row has been locked and the current row read inside the write transaction. */
export function mergeJobSnapshots(previous: Job, incoming: Job): Job {
  const merged: { -readonly [Key in keyof Job]: Job[Key] } = { ...incoming };
  merged.reviewedMetadata = incoming.reviewedMetadata ?? previous.reviewedMetadata;
  for (const key of ['responsibilities', 'requirements', 'detailUrl', 'publishedAt', 'sourceUpdatedAt', 'deadlineAt', 'lastVerifiedAt'] as const) {
    if (incoming[key] === null) Object.assign(merged, { [key]: previous[key] });
  }
  for (const key of ['employmentType', 'recruitmentChannel', 'recruitmentStatus'] as const) {
    if (incoming[key] === 'unknown') Object.assign(merged, { [key]: previous[key] });
  }
  // Raw wording and its derived value form a group. Changed raw wording invalidates the old derivation.
  for (const [raw, derived] of [['locationRaw', 'cityCodes'], ['educationRaw', 'minimumDegree'], ['salaryRaw', 'salary']] as const) {
    if (incoming[raw] === null) Object.assign(merged, { [raw]: previous[raw], [derived]: previous[derived] });
    else if (incoming[raw] === previous[raw] && incoming[derived] === undefined) Object.assign(merged, { [derived]: previous[derived] });
  }
  for (const key of ['publishedAt', 'sourceUpdatedAt', 'deadlineAt'] as const) {
    if (incoming[key]?.raw === previous[key]?.raw && incoming[key]?.value === null && previous[key]?.value !== null) merged[key] = previous[key];
  }
  // Missing form data must not remove an existing application route. An explicit new method replaces the group.
  if (incoming.applicationMethod === 'unknown') {
    merged.applicationMethod = previous.applicationMethod;
    merged.applyUrl = previous.applyUrl;
    merged.applicationInstructions = incoming.applicationInstructions ?? previous.applicationInstructions;
  } else if (incoming.applicationMethod === previous.applicationMethod && incoming.applicationInstructions === null) {
    merged.applicationInstructions = previous.applicationInstructions;
  }
  if (incoming.verificationStatus === 'pending' && previous.verificationStatus === 'verified') merged.verificationStatus = 'verified';
  if (merged.recruitmentStatus === 'open') merged.closedAt = null;
  else if (previous.closedAt !== null || incoming.closedAt === null) merged.closedAt = previous.closedAt;
  merged.firstSeenAt = new Date(Math.min(Date.parse(previous.firstSeenAt), Date.parse(incoming.firstSeenAt))).toISOString();
  merged.lastSeenAt = new Date(Math.max(Date.parse(previous.lastSeenAt), Date.parse(incoming.lastSeenAt))).toISOString();
  if (merged.lastVerifiedAt && previous.lastVerifiedAt && Date.parse(merged.lastVerifiedAt) < Date.parse(previous.lastVerifiedAt)) merged.lastVerifiedAt = previous.lastVerifiedAt;
  if (jobReviewReasons(merged).length) merged.visibility = 'review';
  // A hidden retry of identical content does not revoke an existing publication decision.
  if (previous.visibility === 'published' && merged.visibility === 'hidden'
      && sameJobContent({ ...previous, visibility: 'hidden' }, merged)) merged.visibility = 'published';
  const ignored = new Set(['firstSeenAt', 'lastSeenAt', 'evidence']);
  const retainsPrevious = (Object.keys(merged) as Array<keyof Job>).some(key =>
    !ignored.has(key) && JSON.stringify(merged[key]) !== JSON.stringify(incoming[key]));
  // Evidence supports the current fields, not an unlimited event archive. Never retimestamp support for retained values.
  const evidence = !retainsPrevious ? incoming.evidence : sameJobContent(previous, merged)
    ? previous.evidence : [...previous.evidence, ...incoming.evidence];
  merged.evidence = [...new Map(evidence.map(item => [JSON.stringify(item), item])).values()];
  if (merged.evidence.length > MAX_MERGED_EVIDENCE) throw new MergeEvidenceError();
  return JobSchema.parse(merged);
}

/** Observation/evidence timestamps are not content revisions; no content-version column exists yet. */
export function sameJobContent(left: Job, right: Job): boolean {
  const content = (job: Job) => {
    const { firstSeenAt: _first, lastSeenAt: _last, lastVerifiedAt: _verified, evidence: _evidence, ...fields } = JobSchema.parse(job);
    return JSON.stringify(fields);
  };
  return content(left) === content(right);
}
