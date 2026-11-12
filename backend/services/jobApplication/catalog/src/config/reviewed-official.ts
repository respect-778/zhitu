import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { JobSchema, SourceConfigSchema, type Job, type SourceConfig } from '../../contracts/index.ts';
import { array, identifier, instant, object } from '../../contracts/validation.ts';

export const REVIEWED_BATCH_ID = 'official-internships-2026-11-11';
const BatchSchema = object({
  batchId: identifier, inputSha256: identifier, reviewedAt: instant,
  sources: array(SourceConfigSchema, 1), jobs: array(JobSchema, 1),
});

const raw = readFileSync(new URL('../../config/reviewed/official-internships-2026-11-11.json', import.meta.url));
// This checksum is updated together with the reviewed data, never supplied by an import caller.
const APPROVED_FILE_SHA256 = '60fbee4f3b99dc19389299f211ceb212c7e478cd55092f90935c7d2e9aea2c69';
if (createHash('sha256').update(raw).digest('hex') !== APPROVED_FILE_SHA256) throw new Error('REVIEWED_BATCH_CHANGED');
const batch = BatchSchema.parse(JSON.parse(raw.toString('utf8')));
if (batch.batchId !== REVIEWED_BATCH_ID || batch.sources.length !== 40 || batch.jobs.length !== 100) {
  throw new Error('REVIEWED_BATCH_INVALID');
}
const sources = new Map(batch.sources.map(source => [source.sourceId, source]));
const jobKey = (job: Pick<Job, 'sourceId' | 'sourceJobId'>) => JSON.stringify([job.sourceId, job.sourceJobId]);
const jobs = new Map(batch.jobs.map(job => [jobKey(job), job]));
if (sources.size !== 40 || jobs.size !== 100) throw new Error('REVIEWED_BATCH_INVALID');

// Derived filters and observation/publication state may change independently of the reviewed wording.
const reviewedFields = [
  'sourceId', 'sourceJobId', 'company', 'title', 'employmentType', 'recruitmentChannel',
  'responsibilities', 'requirements', 'applicationInstructions', 'sourceUrl', 'detailUrl', 'applyUrl',
  'applicationMethod', 'locationRaw', 'educationRaw', 'salaryRaw', 'publishedAt', 'deadlineAt', 'reviewedMetadata',
] as const;
function reviewedContent(job: Job) {
  return Object.fromEntries(reviewedFields.map(key => [key, job[key] ?? null]));
}

export function reviewedOfficialBatch() {
  return structuredClone(batch);
}

export function hasReviewedSnapshot(job: Job): boolean {
  const approved = jobs.get(jobKey(job));
  return approved !== undefined && isDeepStrictEqual(reviewedContent(job), reviewedContent(approved));
}

export function assertReviewedOfficialJob(job: Job, source: SourceConfig): void {
  const approved = sources.get(source.sourceId);
  const snapshot = jobs.get(jobKey(job));
  if (!approved || !snapshot || !isDeepStrictEqual(source, approved) || !hasReviewedSnapshot(job) ||
      job.evidence.some(evidence => !snapshot.evidence.some(original => original.sourceUrl === evidence.sourceUrl &&
        original.parserVersion === evidence.parserVersion))) {
    throw new Error('REVIEWED_JOB_MISMATCH');
  }
}

for (const job of batch.jobs) {
  const source = sources.get(job.sourceId);
  if (!source || source.adapter !== 'reviewed-official' || source.company !== job.company ||
      job.reviewedMetadata?.batchId !== REVIEWED_BATCH_ID || job.employmentType !== 'internship') {
    throw new Error('REVIEWED_BATCH_INVALID');
  }
  assertReviewedOfficialJob(job, source);
}
