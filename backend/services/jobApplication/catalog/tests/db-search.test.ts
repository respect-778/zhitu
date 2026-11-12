import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Job } from '../contracts/index.ts';
import { createApi } from '../src/api/server.ts';
import { normalizeJob } from '../src/normalize/job.ts';
import { createPublicationPolicy } from '../src/storage/publication-policy.ts';
import { ingestJob, ingestSource } from './fixtures/ingest.ts';

test('T08 dedicated database search, strict matching, publication and pagination', {
  skip: process.env.CATALOG_DB_TEST === '1' ? false : 'Database integration not run: requires dedicated test writer credentials and CATALOG_DB_TEST=1.',
  timeout: 60_000,
}, async t => {
  const { createCatalogClient } = await import('../src/storage/client.ts');
  const { upsertJob } = await import('../src/storage/jobs.ts');
  const { createCatalogSearch } = await import('../src/storage/search.ts');
  const { publishJobs } = await import('../src/storage/publish.ts');
  const { loadTencentSource } = await import('../src/config/sources.ts');
  const client = await createCatalogClient('write');
  const source = ingestSource(`t08-${randomUUID()}`), untrusted = ingestSource(`t08-${randomUUID()}`);
  const policy = createPublicationPolicy([source]);
  const store = createCatalogSearch(client, policy);
  const api = createApi({ store });
  const sourceIds = [source.sourceId, untrusted.sourceId];
  t.after(async () => {
    try {
      await api.close();
      await client.$transaction([
        client.job.deleteMany({ where: { sourceId: { in: sourceIds } } }),
        client.source.deleteMany({ where: { id: { in: sourceIds } } }),
      ]);
    } finally { await client.$disconnect(); }
  });
  async function save(key: string, patch: Partial<Job> = {}) {
    return upsertJob(client, source, normalizeJob({ ...ingestJob(source.sourceId, key), ...patch }, source).job);
  }
  const bachelor = await save('bachelor', { title: 'Literal 50%_ test', employmentType: 'internship' });
  const master = await save('master', { educationRaw: '硕士及以上学历', locationRaw: '杭州', employmentType: 'full_time' });
  const unknown = await save('unknown', { educationRaw: null, requirements: '具备产品经验', locationRaw: '海外' });
  const none = await save('none', { educationRaw: '学历不限' });
  const associate = await save('associate', { educationRaw: '大专' });
  const hidden = await save('hidden');
  const review = await save('review', { educationRaw: '本科优先' });
  const closed = await save('closed', { recruitmentStatus: 'closed', closedAt: '2026-11-09T01:00:00.000Z' });
  const otherJob = normalizeJob(ingestJob(untrusted.sourceId, 'other'), untrusted).job;
  const other = await upsertJob(client, untrusted, { ...otherJob, visibility: 'published' });
  const publishedIds = [bachelor.id, master.id, unknown.id, none.id, associate.id];

  await t.test('explicit publication is atomic, repeatable and does not enable collection', async () => {
    for (const blocked of [review.id, closed.id, randomUUID(), other.id]) {
      await assert.rejects(publishJobs(client, policy, source.sourceId, [bachelor.id, blocked]));
      assert.equal((await client.job.findUniqueOrThrow({ where: { id: bachelor.id } })).visibility, 'hidden');
    }
    assert.deepEqual(await publishJobs(client, policy, source.sourceId, publishedIds), {
      sourceId: source.sourceId, requested: 5, published: 5, alreadyPublished: 0,
    });
    assert.deepEqual(await publishJobs(client, policy, source.sourceId, publishedIds), {
      sourceId: source.sourceId, requested: 5, published: 0, alreadyPublished: 5,
    });
    assert.equal((await client.source.findUniqueOrThrow({ where: { id: source.sourceId } })).enabled, false);
    await assert.rejects(publishJobs(client, policy, untrusted.sourceId, [other.id]));
  });

  await t.test('combinations and unknown values cannot impersonate strict criteria or other sources', async () => {
    for (const [query, expected] of [
      ['', 5], ['city=440300&degree=bachelor&employmentType=internship&recruitmentChannel=social', 1],
      ['degree=bachelor', 1], ['degree=master', 1], ['degree=associate', 1], ['degree=none', 1], ['degree=unknown', 1],
      ['city=330100', 1], ['city=440300&degree=master', 0], ['recruitmentChannel=campus', 0],
      ['employmentType=unknown', 3], ['sourceKind=announcement', 0], [`sourceId=${untrusted.sourceId}`, 0],
      ['q=50%25_', 1], ['q=%25', 1], ['q=_', 1], ['q=%5C', 0], ['q=%27%20OR%201%3D1%20--', 0],
    ] as const) {
      const response = await api.inject(`/api/catalog/v1/jobs${query ? `?${query}` : ''}`);
      assert.equal(response.statusCode, 200, query);
      assert.equal(response.json().total, expected, query); assert.equal(response.json().items.length, expected, query);
    }
    const sources = (await api.inject('/api/catalog/v1/sources')).json();
    assert.deepEqual(sources.items.map((item: { sourceId: string }) => item.sourceId), [source.sourceId]);
    const production = createCatalogSearch(client, createPublicationPolicy([await loadTencentSource()]));
    assert.equal((await production.search({ sourceId: source.sourceId, page: 1, pageSize: 20 })).total, 0);
  });

  await t.test('stable ties and out-of-range pages keep the total; unpublished and untrusted details are unavailable', async () => {
    const all: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await store.search({ page, pageSize: 2 });
      assert.equal(result.total, 5); all.push(...result.items.map(item => item.id));
    }
    assert.deepEqual(all, [...publishedIds].sort()); assert.equal(new Set(all).size, 5);
    const beyond = await store.search({ page: 4, pageSize: 2 }); assert.equal(beyond.total, 5); assert.deepEqual(beyond.items, []);
    for (const id of [hidden.id, review.id, closed.id, other.id]) {
      assert.equal(await store.detail(id), null); assert.equal((await api.inject(`/api/catalog/v1/jobs/${id}`)).statusCode, 404);
    }
    const detail = (await api.inject(`/api/catalog/v1/jobs/${bachelor.id}`)).json().item;
    assert.equal(detail.requirements, bachelor.job.requirements); assert.equal(detail.applyUrl, null); assert.equal(detail.applicationMethod, 'unknown');
    assert.ok(!Object.hasOwn(detail, 'evidence')); assert.ok(!Object.hasOwn(detail, 'visibility'));
  });

  await t.test('bad published contents fail safely and trusted-source identity changes revoke availability', async () => {
    await client.job.update({ where: { id: bachelor.id }, data: { locationRaw: null } });
    assert.equal((await api.inject('/api/catalog/v1/jobs')).statusCode, 503);
    assert.equal((await api.inject(`/api/catalog/v1/jobs/${bachelor.id}`)).statusCode, 503);
    await client.job.update({ where: { id: bachelor.id }, data: { locationRaw: bachelor.job.locationRaw } });
    await client.source.update({ where: { id: source.sourceId }, data: { entryUrl: 'https://fixture.invalid/changed' } });
    assert.equal((await store.search({ page: 1, pageSize: 20 })).total, 0);
    await assert.rejects(publishJobs(client, policy, source.sourceId, [hidden.id]));
    await client.source.update({ where: { id: source.sourceId }, data: { entryUrl: source.entryUrl } });
    assert.equal((await store.search({ page: 1, pageSize: 20 })).total, 5);
  });
});
