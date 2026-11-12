import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ContractError, type Job, type SourceConfig } from '../contracts/index.ts';

const enabled = process.env.CATALOG_DB_TEST === '1';

test('dedicated PostgreSQL identity, transactional upsert and read/write boundaries', {
  skip: enabled ? false : 'Database integration not run: explicitly set CATALOG_DB_TEST=1 with the dedicated test credentials.',
  timeout: 60_000,
}, async t => {
  const { createCatalogClient } = await import('../src/storage/client.ts');
  const { upsertJob, storedJob, CatalogStorageError } = await import('../src/storage/jobs.ts');
  const { Prisma } = await import('../src/generated/prisma/client.ts');
  const client = await createCatalogClient('write');
  const prefix = `t05-${randomUUID()}`;
  const sourceIds = [`${prefix}-one`, `${prefix}-two`, `${prefix}-concurrent`, `${prefix}-invalid`];
  t.after(async () => {
    try {
      await client.$transaction([
        client.job.deleteMany({ where: { sourceId: { in: sourceIds } } }),
        client.source.deleteMany({ where: { id: { in: sourceIds } } }),
      ]);
    } finally { await client.$disconnect(); }
  });
  function source(id = sourceIds[0]): SourceConfig {
    return {
      sourceId: id, kind: 'enterprise', adapter: 't05-synthetic', entryUrl: 'https://fixture.invalid/jobs',
      allowedHosts: ['fixture.invalid'], scopeKey: 'all:zh-cn', recruitmentChannel: 'unknown', company: '合成单位', enabled: false,
    };
  }
  function job(id = sourceIds[0], sourceJobId = '2093163274496552960'): Job {
    return {
      sourceId: id, sourceJobId, company: '同名合成单位', title: '同名产品岗位',
      employmentType: 'internship', recruitmentChannel: 'campus', responsibilities: '合成职责', requirements: '本科',
      applicationInstructions: null, sourceUrl: 'https://fixture.invalid/jobs/one', detailUrl: 'https://fixture.invalid/jobs/one',
      applyUrl: null, applicationMethod: 'unknown', locationRaw: '深圳', cityCodes: ['440300'],
      educationRaw: '本科', minimumDegree: 'bachelor', salaryRaw: '200元/天', salary: { min: 200, max: 200, currency: 'CNY', period: 'day' },
      publishedAt: null, sourceUpdatedAt: { raw: '2026-11-09', value: '2026-11-09', precision: 'day', timezone: 'Asia/Shanghai' }, deadlineAt: null,
      firstSeenAt: '2026-11-09T01:00:00.000Z', lastSeenAt: '2026-11-09T01:00:00.000Z',
      lastVerifiedAt: null, closedAt: null, recruitmentStatus: 'unknown', verificationStatus: 'pending', visibility: 'hidden',
      evidence: [{ sourceUrl: 'https://fixture.invalid/jobs/one', observedAt: '2026-11-09T01:00:00.000Z', parserVersion: 't05-fixture-v1', locator: 'row:1' }],
    };
  }

  await t.test('same source identity is idempotent and preserves the full validated record', async () => {
    const original = job();
    const first = await upsertJob(client, source(), original);
    const again = await upsertJob(client, source(), original);
    assert.equal(again.id, first.id);
    assert.deepEqual(again.job, original);
    assert.equal(await client.job.count({ where: { sourceId: sourceIds[0] } }), 1);
    assert.equal(again.job.sourceJobId, '2093163274496552960');
  });

  await t.test('same titles from another source or another source job remain distinct', async () => {
    const original = await upsertJob(client, source(), job());
    const anotherSource = await upsertJob(client, source(sourceIds[1]), job(sourceIds[1]));
    const anotherJob = await upsertJob(client, source(), job(sourceIds[0], '2093163274496552961'));
    assert.equal(new Set([original.id, anotherSource.id, anotherJob.id]).size, 3);
    assert.equal(await client.job.count({ where: { sourceId: { in: sourceIds.slice(0, 2) } } }), 3);
  });

  await t.test('updates keep internal ID and earliest observation; a late retry cannot replace a newer snapshot', async () => {
    const previous = await upsertJob(client, source(), job());
    const updated = await upsertJob(client, source(), {
      ...job(), title: '更新后的合成岗位', firstSeenAt: '2026-11-09T02:00:00.000Z', lastSeenAt: '2026-11-09T02:00:00.000Z',
    });
    assert.equal(updated.id, previous.id);
    assert.equal(updated.job.firstSeenAt, job().firstSeenAt);
    assert.equal(updated.job.title, '更新后的合成岗位');
    const stale = await upsertJob(client, source(), job());
    assert.deepEqual(stale, updated);
  });

  await t.test('concurrent first writes converge to one stable identity', async () => {
    const outputs = await Promise.all(Array.from({ length: 8 }, () => upsertJob(client, source(sourceIds[2]), job(sourceIds[2]))));
    assert.equal(new Set(outputs.map(output => output.id)).size, 1);
    assert.equal(await client.job.count({ where: { sourceId: sourceIds[2] } }), 1);
  });

  await t.test('reverse arrival records the earliest observation without rolling back the newer snapshot', async () => {
    const older = job(sourceIds[0], 'reverse-arrival');
    const newer = {
      ...older, title: '新快照正文', firstSeenAt: '2026-11-09T02:00:00.000Z', lastSeenAt: '2026-11-09T02:00:00.000Z',
    };
    const first = await upsertJob(client, source(), newer);
    const late = await upsertJob(client, source(), older);
    assert.equal(late.id, first.id);
    assert.equal(late.job.firstSeenAt, older.firstSeenAt);
    assert.deepEqual(late.job, { ...first.job, firstSeenAt: older.firstSeenAt });
    const persisted = storedJob(await client.job.findUniqueOrThrow({ where: { id: first.id } }));
    assert.deepEqual(persisted, late);
    assert.deepEqual(await upsertJob(client, source(), older), late);
  });

  await t.test('invalid input and scope rebinding cannot add records or corrupt an existing source', async () => {
    const before = await client.job.count({ where: { sourceId: { in: sourceIds } } });
    await assert.rejects(upsertJob(client, source(sourceIds[3]), { ...job(sourceIds[3]), sourceJobId: 2093163274496552960 }), ContractError);
    await assert.rejects(upsertJob(client, source(sourceIds[3]), job(sourceIds[0])), error => error instanceof CatalogStorageError && error.code === 'SOURCE_IDENTITY_MISMATCH');
    await assert.rejects(upsertJob(client, source(sourceIds[3]), { ...job(sourceIds[3]), title: 'synthetic-private-value\u0000' }), error => {
      assert.ok(error instanceof CatalogStorageError && error.code === 'DATABASE_OPERATION_FAILED');
      assert.ok(!error.message.includes('synthetic-private-value'));
      return true;
    });
    await assert.rejects(upsertJob(client, { ...source(), scopeKey: 'other:channel' }, job()), error => error instanceof CatalogStorageError && error.code === 'SOURCE_IDENTITY_MISMATCH');
    assert.equal(await client.source.count({ where: { id: sourceIds[3] } }), 0);
    assert.equal((await client.source.findUniqueOrThrow({ where: { id: sourceIds[0] } })).scopeKey, 'all:zh-cn');
    assert.equal(await client.job.count({ where: { sourceId: { in: sourceIds } } }), before);
  });

  await t.test('database constraints and least privilege prevent bypassing identity and creating unrelated tables', async () => {
    const existing = await client.job.findFirstOrThrow({ where: { sourceId: sourceIds[0] } });
    const hasSqlState = (code: string) => (error: unknown): boolean => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2010') return false;
      // Prisma 7's pg adapter preserves PostgreSQL SQLSTATE in the adapter cause.
      const adapterError = error.meta?.driverAdapterError;
      if (typeof adapterError !== 'object' || adapterError === null || !('cause' in adapterError)) return false;
      const cause = adapterError.cause;
      return typeof cause === 'object' && cause !== null && 'originalCode' in cause && cause.originalCode === code;
    };
    await assert.rejects(client.$executeRaw`
      INSERT INTO catalog.jobs (source_id, source_job_id, company, title, employment_type, recruitment_channel,
        source_url, application_method, first_seen_at, last_seen_at, recruitment_status, verification_status, visibility, evidence)
      SELECT source_id, source_job_id, company, title, employment_type, recruitment_channel,
        source_url, 'unknown', first_seen_at, last_seen_at, 'unknown', 'pending', 'hidden', evidence
      FROM catalog.jobs WHERE id = ${existing.id}::uuid
    `, hasSqlState('23505'));
    await assert.rejects(client.$executeRaw`CREATE TABLE public.t05_forbidden_table (id integer)`, hasSqlState('42501'));
    // public USAGE is also revoked; inspect catalog metadata without resolving a public object.
    const table = await client.$queryRaw<Array<{ object_count: number }>>`
      SELECT count(*)::integer AS object_count
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = 't05_forbidden_table'
    `;
    assert.equal(table[0].object_count, 0);
    assert.equal(storedJob(existing).id, existing.id);
  });
});
