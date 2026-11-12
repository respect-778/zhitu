import { readApiHost, readApiPort } from '../runtime/config.ts';
import { safeFailure } from '../runtime/errors.ts';
import { loadTrustedSources } from '../config/sources.ts';
import type { CatalogSearchStore } from '../storage/search.ts';

async function main(): Promise<void> {
  const port = readApiPort();
  const host = readApiHost();
  const { createApi } = await import('./server.ts');
  let store: CatalogSearchStore | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  if (process.env.CATALOG_DATABASE_URL !== undefined) {
    const { createCatalogClient } = await import('../storage/client.ts');
    const { createPublicationPolicy } = await import('../storage/publication-policy.ts');
    const { createCatalogSearch } = await import('../storage/search.ts');
    const policy = createPublicationPolicy(await loadTrustedSources());
    const client = await createCatalogClient('read');
    disconnect = () => client.$disconnect();
    store = createCatalogSearch(client, policy);
  }
  const api = createApi({ store, disconnect });
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 5_000);
    deadline.unref();
    try {
      await api.close();
      process.stdout.write(`${JSON.stringify({ service: 'job-catalog-api', status: 'stopped' })}\n`);
    } catch (error) {
      process.exitCode = 1;
      process.stderr.write(`${JSON.stringify(safeFailure(error))}\n`);
    } finally {
      clearTimeout(deadline);
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await api.listen({ host, port });
    process.stdout.write(`${JSON.stringify({ service: 'job-catalog-api', status: 'listening', host, port, ready: false })}\n`);
  } catch (error) {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await api.close();
    throw error;
  }
}

main().catch(error => {
  process.exitCode = 1;
  process.stderr.write(`${JSON.stringify(safeFailure(error))}\n`);
});
