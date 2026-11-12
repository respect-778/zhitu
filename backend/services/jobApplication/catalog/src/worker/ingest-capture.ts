import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadTencentSource } from '../config/sources.ts';
import { CaptureError, parseTencentCapture, readCaptureFile, readIngestOptions } from './capture.ts';
import { ingestJobs } from './ingest.ts';

async function main() {
  if (process.platform !== 'linux') throw new CaptureError('PLATFORM_UNSUPPORTED');
  const { input } = readIngestOptions(process.argv.slice(2));
  const source = await loadTencentSource();
  const capture = parseTencentCapture(await readCaptureFile(input), source);
  // No HTTP/Crawlee imports. Credentials enter only this offline storage process, after file validation.
  const { createCatalogClient } = await import('../storage/client.ts');
  const client = await createCatalogClient('write');
  try {
    const { mergeUpsertJob } = await import('../storage/jobs.ts');
    const report = await ingestJobs(source, capture.jobs, (trusted, job) => mergeUpsertJob(client, trusted, job));
    process.stdout.write(`${JSON.stringify({ mode: 'ingest', synthetic: false, sourceId: source.sourceId,
      persisted: report.accepted > 0, collectionRunId: capture.collectionReport.runId, collectionReport: capture.collectionReport, ingestReport: report })}\n`);
    if (report.rejected) process.exitCode = 1;
  } finally { await client.$disconnect(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({ code: error instanceof CaptureError ? error.code : 'INGEST_FAILED', message: 'Catalog ingest did not complete. No input contents or database diagnostics are disclosed.' })}\n`);
  });
}
