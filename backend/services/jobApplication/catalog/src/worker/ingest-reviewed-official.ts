import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { reviewedOfficialBatch } from '../config/reviewed-official.ts';
import { normalizeJob } from '../normalize/job.ts';
import { createPublicationPolicy } from '../storage/publication-policy.ts';
import { ingestJobs, type IngestReport } from './ingest.ts';

export function validateReviewedBatch() {
  const batch = reviewedOfficialBatch();
  const bySource = new Map(batch.sources.map(source => [source.sourceId, source]));
  const policy = createPublicationPolicy(batch.sources);
  const jobs = batch.jobs.map(job => {
    const source = bySource.get(job.sourceId);
    if (!source) throw new Error('REVIEWED_SOURCE_MISSING');
    return policy.assertPublishable(normalizeJob(job, source).job);
  });
  return { batch, jobs, policy };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--publish'].includes(args[0])) throw new Error('REVIEWED_ARGUMENTS_INVALID');
  const { batch, jobs, policy } = validateReviewedBatch();
  if (args[0] === '--check') {
    process.stdout.write(`${JSON.stringify({ mode: 'reviewed-official-check', batchId: batch.batchId,
      rows: jobs.length, companies: batch.sources.length, persisted: false })}\n`);
    return;
  }
  const { createCatalogClient } = await import('../storage/client.ts');
  const { mergeUpsertJob } = await import('../storage/jobs.ts');
  const { publishJobs } = await import('../storage/publish.ts');
  const client = await createCatalogClient('write');
  const reports: IngestReport[] = [];
  const publications: { published: number; alreadyPublished: number }[] = [];
  try {
    // Every row and publication check above completes before the first database write.
    for (const source of batch.sources) {
      const report = await ingestJobs(source, jobs.filter(job => job.sourceId === source.sourceId),
        (trusted, job) => mergeUpsertJob(client, trusted, job));
      reports.push(report);
      process.stdout.write(`${JSON.stringify({ stage: 'ingested', ...report })}\n`);
    }
    const total = (key: 'accepted' | 'inserted' | 'updated' | 'duplicates' | 'rejected') =>
      reports.reduce((sum, report) => sum + report[key], 0);
    if (!total('rejected')) {
      for (const report of reports) {
        const ids = report.rows.map(row => row.id!);
        const result = await publishJobs(client, policy, report.sourceId, ids);
        publications.push(result);
        process.stdout.write(`${JSON.stringify({ stage: 'published', ...result })}\n`);
      }
    }
    const summary = { mode: 'reviewed-official-import', batchId: batch.batchId,
      rows: jobs.length, companies: batch.sources.length, accepted: total('accepted'), inserted: total('inserted'),
      updated: total('updated'), duplicates: total('duplicates'), rejected: total('rejected'),
      published: publications.reduce((sum, result) => sum + result.published, 0),
      alreadyPublished: publications.reduce((sum, result) => sum + result.alreadyPublished, 0) };
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (summary.rejected) process.exitCode = 1;
  } finally { await client.$disconnect(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({ code: 'REVIEWED_IMPORT_FAILED',
      message: 'Reviewed batch import did not complete. Inspect the per-source progress report.' })}\n`);
  });
}
