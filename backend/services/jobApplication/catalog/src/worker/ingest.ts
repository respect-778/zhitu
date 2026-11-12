import { randomUUID } from 'node:crypto';
import { SourceConfigSchema, type Job, type SourceConfig } from '../../contracts/index.ts';
import { MAX_INGEST_RECORDS, jobReviewReasons, normalizeJob, NormalizeError, type ReviewReason } from '../normalize/job.ts';
import type { MergedStoredJob } from '../storage/jobs.ts';
import { MergeEvidenceError } from '../storage/merge.ts';

export type JobWriter = (source: SourceConfig, job: Job) => Promise<MergedStoredJob>;
type RejectReason = NormalizeError['code'] | 'DATABASE_OPERATION_FAILED' | 'EVIDENCE_LIMIT_EXCEEDED';
export interface IngestRow {
  index: number;
  outcome: 'inserted' | 'updated' | 'duplicate' | 'rejected';
  sourceUrl?: string;
  id?: string;
  reason?: RejectReason;
  reviewReasons?: ReviewReason[];
}
export interface IngestReport {
  runId: string; sourceId: string; scopeKey: string;
  status: 'complete' | 'partial' | 'failed';
  recordsReceived: number; accepted: number; inserted: number; updated: number; duplicates: number; review: number; rejected: number;
  rows: IngestRow[];
}

function availableSourceUrl(input: unknown, source: SourceConfig): string | undefined {
  // A malformed row can retain an official reference without echoing its arbitrary strings/error contents.
  if (source.adapter !== 'tencent' || !input || typeof input !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, 'sourceJobId');
  const id = descriptor && 'value' in descriptor ? descriptor.value : undefined;
  return typeof id === 'string' && /^[0-9]{1,64}$/.test(id) ? `https://careers.tencent.com/jobdesc.html?postId=${id}` : undefined;
}

/** Each valid item owns one transaction. A rejected item never rolls back another item's success. */
export async function ingestJobs(sourceInput: SourceConfig, inputs: unknown[], write: JobWriter): Promise<IngestReport> {
  const source = SourceConfigSchema.parse(sourceInput);
  if (!Array.isArray(inputs) || inputs.length > MAX_INGEST_RECORDS) throw new Error('INGEST_BATCH_INVALID');
  const report: IngestReport = { runId: `ingest-${randomUUID()}`, sourceId: source.sourceId, scopeKey: source.scopeKey,
    status: 'complete', recordsReceived: inputs.length, accepted: 0, inserted: 0, updated: 0, duplicates: 0, review: 0, rejected: 0, rows: [] };
  for (const [index, input] of inputs.entries()) {
    let normalized: ReturnType<typeof normalizeJob>;
    try { normalized = normalizeJob(input, source); }
    catch (error) {
      report.rejected++;
      report.rows.push({ index, outcome: 'rejected', reason: error instanceof NormalizeError ? error.code : 'INVALID_JOB', sourceUrl: availableSourceUrl(input, source) });
      continue;
    }
    try {
      const stored = await write(source, normalized.job);
      report.accepted++;
      if (stored.outcome === 'duplicate') report.duplicates++; else report[stored.outcome]++;
      if (stored.job.visibility === 'review') report.review++;
      report.rows.push({ index, outcome: stored.outcome, id: stored.id, sourceUrl: normalized.job.sourceUrl,
        reviewReasons: [...new Set([...normalized.reviewReasons, ...jobReviewReasons(stored.job)])] });
    } catch (error) {
      report.rejected++;
      report.rows.push({ index, outcome: 'rejected', reason: error instanceof MergeEvidenceError ? error.code : 'DATABASE_OPERATION_FAILED', sourceUrl: normalized.job.sourceUrl });
    }
  }
  report.status = report.rejected === 0 ? 'complete' : report.accepted ? 'partial' : 'failed';
  return report;
}
