import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogSearchQuery } from '../contracts/index.ts';
import { createApi } from '../src/api/server.ts';
import { parseSearchQuery } from '../src/api/query.ts';
import { readApiHost } from '../src/runtime/config.ts';
import type { CatalogSearchStore } from '../src/storage/search.ts';

const id = '00000000-0000-4000-8000-000000000001';
function emptyStore(): CatalogSearchStore {
  return { search: async query => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize }),
    detail: async () => null, sources: async () => ({ items: [] }) };
}

test('API validates combined filters before calling the database and preserves literal search text', async () => {
  let seen: CatalogSearchQuery | undefined;
  const api = createApi({ store: { ...emptyStore(), search: async query => {
    seen = query; return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  } } });
  try {
    const response = await api.inject('/api/catalog/v1/jobs?q=50%25_%27%5C&city=440300&degree=bachelor&employmentType=internship&recruitmentChannel=social&sourceKind=enterprise&sourceId=tencent-native&page=2&pageSize=3');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { items: [], total: 0, page: 2, pageSize: 3 });
    assert.deepEqual(seen, { q: "50%_'\\", city: '440300', degree: 'bachelor', employmentType: 'internship', recruitmentChannel: 'social', sourceKind: 'enterprise', sourceId: 'tencent-native', page: 2, pageSize: 3 });
    assert.deepEqual((await api.inject('/api/catalog/v1/sources')).json(), { items: [] });
    assert.equal((await api.inject(`/api/catalog/v1/jobs/${id}`)).json().error.code, 'JOB_NOT_FOUND');
  } finally { await api.close(); }
});

test('unknown, duplicate, malformed and excessive query values fail with fixed errors and no database call', async () => {
  let calls = 0;
  const api = createApi({ store: { ...emptyStore(), search: async () => { calls++; throw new Error('private-token'); } } });
  try {
    const invalid = ['unknown=private-token', 'q=a&q=b', 'q=a&%71=b', 'q=', 'q', 'q=a&', 'q=%', 'q=%GG', 'q=%C3%28', 'q=%00', 'q=+a',
      'q=' + 'a'.repeat(121), 'page=0', 'page=-1', 'page=1.1', 'page=1e2', 'page=01', 'page=10001', 'pageSize=51', 'pageSize=101', 'pageSize=0',
      'city=深圳', 'degree=college', 'employmentType=campus', 'recruitmentChannel=full_time', 'sourceKind=other', 'sourceId=../private-token',
      'sourceId=' + 'a'.repeat(65), 'q[0]=x', '__proto__=x', 'constructor=x'];
    for (const query of invalid) {
      const response = await api.inject(`/api/catalog/v1/jobs?${query}`);
      assert.equal(response.statusCode, 400, query);
      assert.deepEqual(response.json(), { error: { code: 'INVALID_REQUEST', message: 'The catalog request is invalid.' } });
      assert.ok(!response.body.includes('private-token'));
    }
    for (const url of [`/api/catalog/v1/jobs/${id}?page=1`, '/api/catalog/v1/sources?sourceId=x', '/api/catalog/v1/jobs/private-token']) {
      assert.equal((await api.inject(url)).statusCode, 400, url);
    }
    for (const path of ['%GG', '%E0%A4%A', 'a'.repeat(101)]) {
      const response = await api.inject(`/api/catalog/v1/jobs/${path}?password=private-token`);
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, 'INVALID_REQUEST'); assert.ok(!response.body.includes('private-token'));
    }
    assert.equal(calls, 0);
  } finally { await api.close(); }
});

test('empty results, missing jobs, unavailable database and unknown routes remain distinct without diagnostic leaks', async () => {
  const unavailable = createApi();
  const failed = createApi({ store: { search: async () => { throw new Error('postgres://private-token@internal/path'); },
    detail: async () => { throw new Error('private-token'); }, sources: async () => { throw new Error('private-token'); } } });
  try {
    for (const api of [unavailable, failed]) {
      for (const url of ['/api/catalog/v1/jobs', '/api/catalog/v1/sources', `/api/catalog/v1/jobs/${id}`]) {
        const response = await api.inject(url);
        assert.equal(response.statusCode, 503);
        assert.deepEqual(response.json(), { error: { code: 'CATALOG_UNAVAILABLE', message: 'The catalog is temporarily unavailable.' } });
      }
      const missing = await api.inject('/private-token?password=private-token');
      assert.equal(missing.statusCode, 404); assert.ok(!missing.body.includes('private-token'));
      assert.equal((await api.inject({ method: 'POST', url: '/api/catalog/v1/jobs', payload: { secret: 'private-token' } })).statusCode, 404);
      assert.equal((await api.inject('/api/catalog/v1/jobs?page=0')).statusCode, 400);
      const health = (await api.inject('/health')).json();
      assert.equal(health.ready, false); assert.equal(health.capabilities.query, 'implemented');
    }
  } finally { await unavailable.close(); await failed.close(); }
});

test('API disconnects its reader on close and container binding is explicit and constrained', async () => {
  let disconnects = 0;
  const api = createApi({ store: emptyStore(), disconnect: async () => { disconnects++; } });
  await api.ready(); await api.close(); await api.close();
  assert.equal(disconnects, 1);
  assert.equal(readApiHost({}, 'win32'), '127.0.0.1');
  assert.equal(readApiHost({ CATALOG_API_BIND: 'container', CATALOG_DATABASE_ENDPOINT: 'container' }, 'linux'), '0.0.0.0');
  for (const env of [{ CATALOG_API_BIND: '0.0.0.0' }, { CATALOG_API_BIND: '127.0.0.1' }, { CATALOG_API_BIND: 'container' },
    { CATALOG_API_BIND: 'container', CATALOG_DATABASE_ENDPOINT: 'local' }]) assert.throws(() => readApiHost(env, 'linux'));
  assert.throws(() => readApiHost({ CATALOG_API_BIND: 'container', CATALOG_DATABASE_ENDPOINT: 'container' }, 'win32'));
  assert.equal(parseSearchQuery('/?degree=unknown').degree, 'unknown');
});
