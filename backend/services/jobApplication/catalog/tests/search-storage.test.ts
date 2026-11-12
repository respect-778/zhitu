import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JobSchema, type Job } from '../contracts/index.ts';
import type { Job as JobRow, PrismaClient } from '../src/generated/prisma/client.ts';
import { normalizeJob } from '../src/normalize/job.ts';
import { createCatalogSearch, literalSubstring, searchWhere } from '../src/storage/search.ts';
import { createPublicationPolicy, MAX_PUBLIC_JOB_BYTES, PublicationError } from '../src/storage/publication-policy.ts';
import { publishJobs } from '../src/storage/publish.ts';
import { readPublishOptions } from '../src/storage/publish-cli.ts';
import { loadTencentSource } from '../src/config/sources.ts';
import { ingestJob, ingestSource } from './fixtures/ingest.ts';

const id = '00000000-0000-4000-8000-000000000001';
const source = ingestSource('t08-synthetic');
const policy = createPublicationPolicy([source]);
const job = { ...normalizeJob(ingestJob(source.sourceId), source).job, visibility: 'published' as const };
function row(input: Job = job): JobRow {
  return { ...input, id, cityCodes: input.cityCodes ?? [], minimumDegree: input.minimumDegree ?? null,
    salary: input.salary ?? null, firstSeenAt: new Date(input.firstSeenAt), lastSeenAt: new Date(input.lastSeenAt),
    lastVerifiedAt: input.lastVerifiedAt ? new Date(input.lastVerifiedAt) : null, closedAt: input.closedAt ? new Date(input.closedAt) : null,
    createdAt: new Date(), updatedAt: new Date() } as JobRow;
}

test('search uses one read-only repeatable snapshot, identical filters, bound literals, stable UUID ordering and explicit DTO fields', async () => {
  let countWhere: unknown, listWhere: unknown, transactionOptions: unknown;
  const calls: string[] = [];
  const fake = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
      transactionOptions = options;
      return callback({ $executeRaw: async (sql: TemplateStringsArray) => { assert.equal(sql.join(''), 'SET TRANSACTION READ ONLY'); calls.push('read-only'); },
        job: {
          count: async ({ where }: { where: unknown }) => { countWhere = where; calls.push('count'); return 1; },
          findMany: async (args: { where: unknown; orderBy: unknown; skip: number; take: number }) => {
            listWhere = args.where; calls.push('items'); assert.deepEqual(args.orderBy, [{ firstSeenAt: 'desc' }, { id: 'asc' }]);
            assert.equal(args.skip, 3); assert.equal(args.take, 3); return [row()];
          },
          findFirst: async () => row(),
        }, source: { findMany: async () => [{ id: source.sourceId }] },
      });
    },
  } as unknown as PrismaClient;
  const store = createCatalogSearch(fake, policy);
  const result = await store.search({ q: "%' OR 1=1 --_\\", city: '440300', degree: 'bachelor', employmentType: 'internship',
    recruitmentChannel: 'social', sourceKind: 'enterprise', sourceId: source.sourceId, page: 2, pageSize: 3 });
  assert.strictEqual(countWhere, listWhere);
  assert.deepEqual(transactionOptions, { isolationLevel: 'RepeatableRead', maxWait: 5_000, timeout: 10_000 });
  assert.deepEqual(calls, ['read-only', 'count', 'items']);
  assert.equal(result.total, 1); assert.equal(result.items[0].minimumDegree, 'bachelor');
  for (const privateKey of ['evidence', 'visibility', 'parserVersion', 'locator', 'allowedHosts', 'adapter', 'scopeKey', 'entryUrl', 'createdAt', 'sourceUrl', 'requirements']) {
    assert.ok(!Object.hasOwn(result.items[0], privateKey), privateKey);
  }
  const detail = await store.detail(id);
  assert.equal(detail?.requirements, job.requirements); assert.equal(detail?.applyUrl, null); assert.equal(detail?.applicationMethod, 'unknown');
  assert.ok(!JSON.stringify(detail).includes('row:1'));
  assert.deepEqual(await store.sources(), { items: [{ sourceId: source.sourceId, company: source.company, kind: source.kind, recruitmentChannel: 'social' }] });
  assert.equal((countWhere as { minimumDegree: string }).minimumDegree, 'bachelor');
  assert.equal((countWhere as { employmentType: string }).employmentType, 'internship');
  assert.equal(literalSubstring("%' OR 1=1 --_\\"), "\\%' OR 1=1 --\\_\\\\");
  assert.equal(searchWhere({ page: 1, pageSize: 20, degree: 'unknown' }, policy).minimumDegree, null);
  assert.ok(!JSON.stringify(countWhere).includes('"enabled"'));
});

test('corrupt published records fail the request instead of being silently removed from counted items', async () => {
  for (const bad of [{ ...job, title: '' }, { ...job, verificationStatus: 'pending' as const }, { ...job, detailUrl: 'https://private.invalid/job' },
    { ...job, title: '中'.repeat(201) }, { ...job, salaryRaw: '中'.repeat(3000) }, { ...job, requirements: '中'.repeat(45_000) }]) {
    const fake = { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $executeRaw: async () => 0, job: { count: async () => 1, findMany: async () => [row(bad)], findFirst: async () => row(bad) },
    }) } as unknown as PrismaClient;
    const store = createCatalogSearch(fake, policy);
    await assert.rejects(store.search({ page: 1, pageSize: 20 }), { message: 'CATALOG_UNAVAILABLE' });
    await assert.rejects(store.detail(id), { message: 'CATALOG_UNAVAILABLE' });
  }
});

test('canonical publication policy rejects review, unverified, closed, unsupported source and inaccurate Tencent links', async () => {
  assert.equal(policy.assertPublishable({ ...job, visibility: 'hidden', minimumDegree: undefined, educationRaw: null, employmentType: 'unknown', publishedAt: null }).minimumDegree, undefined);
  const metadataOnly = policy.assertPublishable({ ...job, responsibilities: null, requirements: null, applicationInstructions: null });
  assert.equal(metadataOnly.responsibilities, null); assert.equal(metadataOnly.requirements, null);
  for (const patch of [{ visibility: 'review' }, { verificationStatus: 'pending' }, { lastVerifiedAt: null }, { recruitmentStatus: 'closed' },
    { closedAt: job.lastSeenAt }, { locationRaw: null },
    { educationRaw: '本科优先', minimumDegree: undefined }, { sourceId: 'arbitrary-db-source' }, { company: 'wrong-company' },
    { detailUrl: 'https://private.invalid/job' }, { title: '<script>bad</script>' }]) {
    assert.throws(() => policy.assertPublishable({ ...job, ...patch } as Job), PublicationError);
  }
  const tencent = await loadTencentSource(), tencentPolicy = createPublicationPolicy([tencent]);
  const detailUrl = 'https://careers.tencent.com/jobdesc.html?postId=123';
  const candidate = { ...job, sourceId: tencent.sourceId, sourceJobId: '123', company: '腾讯', sourceUrl: detailUrl, detailUrl,
    evidence: [{ ...job.evidence[0], sourceUrl: 'https://careers.tencent.com/tencentcareer/api/post/ByPostId?postId=123&language=zh-cn' }] };
  assert.equal(tencent.enabled, false); tencentPolicy.assertPublishable(candidate);
  for (const patch of [{ detailUrl: 'https://careers.tencent.com/' }, { sourceJobId: '124' },
    { applyUrl: detailUrl, applicationMethod: 'web_form' }]) assert.throws(() => tencentPolicy.assertPublishable({ ...candidate, ...patch } as Job));
});

test('local publishing accepts only the fixed source and explicit unique bounded UUIDs', () => {
  assert.deepEqual(readPublishOptions(['--source', 'tencent-native', '--ids', id]), { sourceId: 'tencent-native', ids: [id] });
  for (const args of [[], ['--source', 'arbitrary', '--ids', id], ['--source', 'tencent-native', '--ids', '*'],
    ['--source', 'tencent-native', '--ids', `${id},${id}`], ['--source', 'tencent-native', '--ids', id, '--host', 'private-token']]) {
    assert.throws(() => readPublishOptions(args), { message: 'PUBLICATION_REJECTED' });
  }
});

test('valid but oversized records cannot publish or create unbounded public summaries; no raw text is truncated', () => {
  const companyPolicy = createPublicationPolicy([{ ...source, company: null }]);
  for (const [candidate, selectedPolicy] of [
    [{ ...job, title: '中'.repeat(201) }, policy], [{ ...job, company: '中'.repeat(121) }, companyPolicy],
    [{ ...job, salaryRaw: '中'.repeat(3000) }, policy], [{ ...job, requirements: '中'.repeat(45_000) }, policy],
  ] as const) {
    JobSchema.parse(candidate);
    const before = JSON.stringify(candidate);
    assert.throws(() => selectedPolicy.assertPublishable(candidate), PublicationError);
    assert.equal(JSON.stringify(candidate), before);
  }
  const permitted = { ...job, requirements: '完整职责条件。'.repeat(1000) };
  assert.equal(policy.assertPublishable(permitted).requirements, permitted.requirements);
});

function hiddenJobAtPublishedBytes(bytes: number): Job {
  const candidate: Job = { ...job, visibility: 'hidden', requirements: 'x' };
  const padding = bytes - Buffer.byteLength(JSON.stringify({ ...candidate, visibility: 'published' }), 'utf8');
  assert.ok(padding >= 0);
  return JobSchema.parse({ ...candidate, requirements: 'x'.repeat(padding + 1) });
}

test('publication byte limits agree before and after the visibility change at max-1, max, max+1 and the reported hidden-max case', () => {
  for (const bytes of [MAX_PUBLIC_JOB_BYTES - 1, MAX_PUBLIC_JOB_BYTES, MAX_PUBLIC_JOB_BYTES + 1, MAX_PUBLIC_JOB_BYTES + 3]) {
    const hidden = hiddenJobAtPublishedBytes(bytes);
    const published = { ...hidden, visibility: 'published' as const };
    assert.equal(Buffer.byteLength(JSON.stringify(hidden), 'utf8'), bytes - 3);
    assert.equal(Buffer.byteLength(JSON.stringify(published), 'utf8'), bytes);
    for (const candidate of [hidden, published]) {
      const before = JSON.stringify(candidate);
      if (bytes <= MAX_PUBLIC_JOB_BYTES) assert.deepEqual(policy.assertPublishable(candidate), candidate);
      else assert.throws(() => policy.assertPublishable(candidate), PublicationError, `${bytes} published bytes, current ${candidate.visibility}`);
      assert.equal(JSON.stringify(candidate), before);
    }
  }
});

test('publication at the byte boundary remains readable and idempotent; oversized candidates never reach the write', async () => {
  const { sourceId, ...sourceFields } = source;
  for (const bytes of [MAX_PUBLIC_JOB_BYTES - 1, MAX_PUBLIC_JOB_BYTES, MAX_PUBLIC_JOB_BYTES + 1, MAX_PUBLIC_JOB_BYTES + 3]) {
    const candidate = hiddenJobAtPublishedBytes(bytes);
    let current = row(candidate), writes = 0;
    const tx = {
      $queryRaw: async () => [{ source_id: sourceId }], $executeRaw: async () => 0,
      source: { findUnique: async () => ({ id: sourceId, ...sourceFields, createdAt: new Date(), updatedAt: new Date() }) },
      job: {
        findMany: async () => [current], findFirst: async () => current, count: async () => 1,
        updateMany: async ({ data }: { data: { visibility: string } }) => {
          assert.equal(data.visibility, 'published'); writes++; current = { ...current, visibility: data.visibility }; return { count: 1 };
        },
      },
    };
    const fake = { $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
    if (bytes > MAX_PUBLIC_JOB_BYTES) {
      await assert.rejects(publishJobs(fake, policy, sourceId, [id]), PublicationError);
      assert.equal(writes, 0); assert.equal(current.visibility, 'hidden');
    } else {
      assert.equal((await publishJobs(fake, policy, sourceId, [id])).published, 1);
      assert.equal(current.visibility, 'published');
      const store = createCatalogSearch(fake, policy);
      assert.equal((await store.search({ page: 1, pageSize: 1 })).items[0].id, id);
      assert.equal((await store.detail(id))?.requirements, candidate.requirements);
      assert.equal((await publishJobs(fake, policy, sourceId, [id])).alreadyPublished, 1);
      assert.equal(writes, 1);
    }
    assert.equal(current.requirements, candidate.requirements);
  }
});
