import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadMetadataSource } from '../config/sources.ts';
import { metadataSourceIds } from '../config/internship-profiles.ts';
import { readMetadataCapture } from '../adapters/internship-metadata.ts';
import { normalizeJob } from '../normalize/job.ts';
import { createPublicationPolicy } from '../storage/publication-policy.ts';
import { CaptureError, checkInputPath, readInternshipCaptureFile } from './capture.ts';
import { ingestJobs } from './ingest.ts';

export function readMetadataIngestOptions(args: string[]): { sourceId: string; input: string } {
  if (args.length !== 4 || args[0] !== '--source' || !['tencent-internship', ...metadataSourceIds].includes(args[1]) || args[2] !== '--input') throw new CaptureError('INVALID_ARGUMENTS');
  checkInputPath(args[3]);
  return { sourceId: args[1], input: args[3] };
}
async function main() {
  if (process.platform !== 'linux') throw new CaptureError('PLATFORM_UNSUPPORTED');
  const options = readMetadataIngestOptions(process.argv.slice(2));
  const source = await loadMetadataSource(options.sourceId);
  const parsed = readMetadataCapture(await readInternshipCaptureFile(options.input), source);
  const policy = createPublicationPolicy([source]);
  const jobs = parsed.jobs.map(job => policy.assertPublishable(normalizeJob(job, source).job));
  const { createCatalogClient } = await import('../storage/client.ts');
  const client = await createCatalogClient('write');
  try {
    const { mergeUpsertJob } = await import('../storage/jobs.ts');
    const report = await ingestJobs(source, jobs, (trusted, job) => mergeUpsertJob(client, trusted, job));
    process.stdout.write(`${JSON.stringify({ mode: 'ingest-metadata', sourceId: source.sourceId, industry: parsed.industry,
      synthetic: false, persisted: report.accepted > 0, ingestReport: report })}\n`);
    if (report.rejected) process.exitCode = 1;
  } finally { await client.$disconnect(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({ code: 'METADATA_INGEST_FAILED', message: 'Metadata ingest did not complete. No input or database diagnostics are disclosed.' })}\n`);
  });
}
