import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadTrustedSources } from '../config/sources.ts';
import { createPublicationPolicy, PublicationError, validatePublicationIds } from './publication-policy.ts';
import { metadataSourceIds } from '../config/internship-profiles.ts';

export function readPublishOptions(args: string[]): { sourceId: string; ids: string[] } {
  if (args.length !== 4 || args[0] !== '--source' || !['tencent-native', 'tencent-internship', ...metadataSourceIds].includes(args[1]) || args[2] !== '--ids') throw new PublicationError();
  const ids = args[3].split(',');
  validatePublicationIds(ids);
  return { sourceId: args[1], ids };
}
async function main() {
  if (process.platform !== 'linux') throw new PublicationError();
  const { sourceId, ids } = readPublishOptions(process.argv.slice(2));
  const policy = createPublicationPolicy(await loadTrustedSources());
  const { createCatalogClient } = await import('./client.ts');
  const { publishJobs } = await import('./publish.ts');
  const client = await createCatalogClient('write');
  try { process.stdout.write(`${JSON.stringify({ mode: 'publish', ...await publishJobs(client, policy, sourceId, ids) })}\n`); }
  finally { await client.$disconnect(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({ code: error instanceof PublicationError ? error.code : 'PUBLICATION_FAILED',
      message: 'Catalog publication did not complete. No database diagnostics are disclosed.' })}\n`);
  });
}
