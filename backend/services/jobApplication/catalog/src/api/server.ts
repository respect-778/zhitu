import Fastify, { type FastifyReply } from 'fastify';
import { isCatalogJobId, type CatalogErrorCode, type CatalogErrorResponse } from '../../contracts/index.ts';
import type { CatalogSearchStore } from '../storage/search.ts';
import { assertNoQuery, InvalidCatalogRequest, parseSearchQuery } from './query.ts';

const messages: Record<CatalogErrorCode, string> = {
  INVALID_REQUEST: 'The catalog request is invalid.', JOB_NOT_FOUND: 'The job is not available.',
  ROUTE_NOT_FOUND: 'The route is not available.', CATALOG_UNAVAILABLE: 'The catalog is temporarily unavailable.',
};
function failure(code: CatalogErrorCode): CatalogErrorResponse { return { error: { code, message: messages[code] } }; }

export function createApi(options: { store?: CatalogSearchStore; disconnect?: () => Promise<void> } = {}) {
  const api = Fastify({ logger: false, forceCloseConnections: true,
    // Router failures precede setErrorHandler and Fastify's default message contains the raw URL.
    // No route schema exists at this boundary; use the unparameterized reply contract.
    frameworkErrors: (_error, _request, reply) => (reply as FastifyReply).code(400).send(failure('INVALID_REQUEST')),
  });
  api.setErrorHandler((error, _request, reply) => {
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const invalid = error instanceof InvalidCatalogRequest || code === 'FST_ERR_BAD_URL';
    return reply.code(invalid ? 400 : 503).send(failure(invalid ? 'INVALID_REQUEST' : 'CATALOG_UNAVAILABLE'));
  });
  api.setNotFoundHandler((_request, reply) => reply.code(404).send(failure('ROUTE_NOT_FOUND')));
  if (options.disconnect) api.addHook('onClose', async () => { await options.disconnect!(); });
  api.get('/health', async () => ({
    service: 'job-catalog-api',
    check: 'liveness',
    status: 'alive',
    ready: false,
    capabilities: { database: options.store ? 'configured' : 'not-configured', collection: 'separate-worker', query: 'implemented' },
  }));
  const store = () => { if (!options.store) throw new Error('CATALOG_UNAVAILABLE'); return options.store; };
  api.get('/api/catalog/v1/jobs', async request => {
    const query = parseSearchQuery(request.raw.url ?? '');
    return store().search(query);
  });
  api.get('/api/catalog/v1/sources', async request => { assertNoQuery(request.raw.url ?? ''); return store().sources(); });
  api.get<{ Params: { id: string } }>('/api/catalog/v1/jobs/:id', async (request, reply) => {
    assertNoQuery(request.raw.url ?? '');
    if (!isCatalogJobId(request.params.id)) throw new InvalidCatalogRequest();
    const item = await store().detail(request.params.id);
    return item ? { item } : reply.code(404).send(failure('JOB_NOT_FOUND'));
  });
  return api;
}
