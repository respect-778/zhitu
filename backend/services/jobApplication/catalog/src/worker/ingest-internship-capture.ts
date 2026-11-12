import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadTencentInternshipSource } from '../config/sources.ts';
import { CaptureError, checkInputPath, readInternshipCaptureFile } from './capture.ts';
import { parseTencentInternshipCapture } from './internship-capture.ts';
import { ingestJobs } from './ingest.ts';

export function readInternshipIngestOptions(args: string[]): { input: string } {
  if (args.length !== 4 || args[0] !== '--source' || args[1] !== 'tencent-internship' || args[2] !== '--input') throw new CaptureError('INVALID_ARGUMENTS');
  checkInputPath(args[3]);
  return { input: args[3] };
}
async function main() {
  if (process.platform !== 'linux') throw new CaptureError('PLATFORM_UNSUPPORTED');
  const { input } = readInternshipIngestOptions(process.argv.slice(2));
  const source = await loadTencentInternshipSource();
  const capture = parseTencentInternshipCapture(await readInternshipCaptureFile(input), source);
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
    process.stderr.write(`${JSON.stringify({ code: error instanceof CaptureError ? error.code : 'INGEST_FAILED',
      message: 'Catalog internship ingest did not complete. No input contents or database diagnostics are disclosed.' })}\n`);
  });
}
