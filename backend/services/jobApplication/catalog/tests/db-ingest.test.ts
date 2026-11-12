import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ingestJobs } from '../src/worker/ingest.ts';
import { normalizeJob } from '../src/normalize/job.ts';
import { ingestJob, ingestSource } from './fixtures/ingest.ts';

test('T07 dedicated PostgreSQL repeat runs, transaction isolation, evidence and concurrent partial merge', {
  skip: process.env.CATALOG_DB_TEST === '1' ? false : 'Database integration not run: set CATALOG_DB_TEST=1 with dedicated test writer credentials.',
  timeout: 60_000,
}, async t => {
  const { createCatalogClient } = await import('../src/storage/client.ts');
  const { mergeUpsertJob, storedJob } = await import('../src/storage/jobs.ts');
  const client = await createCatalogClient('write');
  const prefix = `t07-${randomUUID()}`;
  const sourceIds = [`${prefix}-batch`, `${prefix}-other`, `${prefix}-concurrent`, `${prefix}-fail`];
  t.after(async () => {
    try { await client.$transaction([
      client.job.deleteMany({ where: { sourceId: { in: sourceIds } } }),
      client.source.deleteMany({ where: { id: { in: sourceIds } } }),
    ]); } finally { await client.$disconnect(); }
  });
  const write = (source: Parameters<typeof mergeUpsertJob>[1], job: Parameters<typeof mergeUpsertJob>[2]) => mergeUpsertJob(client, source, job);

  await t.test('same batch twice keeps UUIDs, records duplicate count and isolates a real database failure', async () => {
    const source = ingestSource(sourceIds[0]);
    const jobs = [ingestJob(source.sourceId, 'one'), { ...ingestJob(source.sourceId, 'bad'), title: 'synthetic-db-error\u0000' },
      { ...ingestJob(source.sourceId, 'invalid'), sourceJobId: 3 }, ingestJob(source.sourceId, 'two')];
    const first = await ingestJobs(source, jobs, write), again = await ingestJobs(source, jobs, write);
    assert.deepEqual([first.accepted, first.inserted, first.rejected], [2, 2, 2]);
    assert.deepEqual([again.accepted, again.inserted, again.duplicates, again.rejected], [2, 0, 2, 2]);
    assert.deepEqual(first.rows.filter(row => row.id).map(row => row.id), again.rows.filter(row => row.id).map(row => row.id));
    assert.equal(first.rows[1].reason, 'DATABASE_OPERATION_FAILED'); assert.equal(first.rows[2].reason, 'INVALID_JOB');
    assert.ok(!JSON.stringify(first).includes('synthetic-db-error'));
    assert.equal(await client.job.count({ where: { sourceId: source.sourceId } }), 2);
    const item = storedJob(await client.job.findFirstOrThrow({ where: { sourceId: source.sourceId } })).job;
    assert.equal(item.evidence[0].locator, 'row:1'); assert.equal(item.salaryRaw, '200元/天'); assert.equal(item.minimumDegree, 'bachelor');
    const other = await ingestJobs(ingestSource(sourceIds[1]), [ingestJob(sourceIds[1], 'one')], write);
    assert.notEqual(other.rows[0].id, first.rows[0].id);
  });

  await t.test('failed first write rolls back the source insert, without leaving an orphan source', async () => {
    const source = ingestSource(sourceIds[3]);
    const result = await ingestJobs(source, [{ ...ingestJob(source.sourceId), responsibilities: 'invalid\u0000' }], write);
    assert.equal(result.rejected, 1); assert.equal(await client.source.count({ where: { id: source.sourceId } }), 0);
  });

  await t.test('same-time concurrent partial observations preserve both independent fields under the lock', async () => {
    const source = ingestSource(sourceIds[2]);
    const base = { ...ingestJob(source.sourceId), salaryRaw: null, educationRaw: null, requirements: null, locationRaw: null };
    const timestamp = '2026-11-09T02:00:00.000Z';
    await mergeUpsertJob(client, source, normalizeJob(base, source).job);
    await Promise.all([
      ingestJobs(source, [{ ...base, salaryRaw: '300元/天', lastSeenAt: timestamp }], write),
      ingestJobs(source, [{ ...base, locationRaw: '杭州', lastSeenAt: timestamp }], write),
    ]);
    const row = storedJob(await client.job.findFirstOrThrow({ where: { sourceId: source.sourceId } }));
    assert.equal(row.job.salaryRaw, '300元/天'); assert.equal(row.job.salary?.min, 300);
    assert.equal(row.job.locationRaw, '杭州'); assert.deepEqual(row.job.cityCodes, ['330100']);
    assert.equal(await client.job.count({ where: { sourceId: source.sourceId } }), 1);
    const stale = await ingestJobs(source, [{ ...base, title: '过时快照', firstSeenAt: '2026-11-08T01:00:00.000Z' }], write);
    assert.equal(stale.duplicates, 1);
    const after = storedJob(await client.job.findUniqueOrThrow({ where: { id: row.id } }));
    assert.equal(after.job.firstSeenAt, '2026-11-08T01:00:00.000Z'); assert.equal(after.job.lastSeenAt, timestamp);
    assert.equal(after.job.title, row.job.title); assert.equal(after.job.salary?.min, 300);
  });

  await t.test('unchanged content extends lastSeen while changed raw values clear derived columns in storage', async () => {
    const source = ingestSource(sourceIds[0]);
    const newer = { ...ingestJob(source.sourceId, 'one'), lastSeenAt: '2026-11-09T03:00:00.000Z' };
    const duplicate = await ingestJobs(source, [newer], write); assert.equal(duplicate.duplicates, 1);
    const saved = storedJob(await client.job.findUniqueOrThrow({ where: { id: duplicate.rows[0].id! } }));
    assert.equal(saved.job.lastSeenAt, newer.lastSeenAt);
    const changed = await ingestJobs(source, [{ ...newer, locationRaw: '海外', educationRaw: '本科优先', salaryRaw: '面议' }], write);
    assert.equal(changed.updated, 1);
    const revised = storedJob(await client.job.findUniqueOrThrow({ where: { id: changed.rows[0].id! } }));
    assert.equal(revised.job.salary, undefined); assert.equal(revised.job.minimumDegree, undefined); assert.equal(revised.job.cityCodes, undefined);
  });

  await t.test('closed-to-expired retains closure time; evidence overflow rolls back only that row', async () => {
    const source = ingestSource(sourceIds[0]);
    const normalized = normalizeJob(ingestJob(source.sourceId, 'closure'), source).job;
    const closedAt = '2026-11-09T01:00:00.000Z', later = '2026-11-09T02:00:00.000Z';
    const closed = await mergeUpsertJob(client, source, { ...normalized, recruitmentStatus: 'closed', closedAt });
    const expired = await mergeUpsertJob(client, source, { ...normalized, recruitmentStatus: 'expired', closedAt: later, lastSeenAt: later });
    assert.equal(expired.job.closedAt, closedAt);
    await mergeUpsertJob(client, source, { ...normalized, lastSeenAt: later });
    const reclosed = await mergeUpsertJob(client, source, { ...normalized, recruitmentStatus: 'closed', closedAt: later, lastSeenAt: later });
    assert.equal(reclosed.job.closedAt, later); assert.equal(reclosed.id, closed.id);
    const { upsertJob } = await import('../src/storage/jobs.ts');
    const large = { ...normalizeJob(ingestJob(source.sourceId, 'evidence-bound'), source).job,
      evidence: Array.from({ length: 128 }, (_, index) => ({ ...normalized.evidence[0], locator: `prior:${index}` })) };
    const before = await upsertJob(client, source, large);
    const report = await ingestJobs(source, [{ ...ingestJob(source.sourceId, 'evidence-bound'), title: '需要新证据的修改', responsibilities: null }, ingestJob(source.sourceId, 'after-bound')], write);
    assert.equal(report.rows[0].reason, 'EVIDENCE_LIMIT_EXCEEDED'); assert.equal(report.accepted, 1);
    assert.deepEqual(storedJob(await client.job.findUniqueOrThrow({ where: { id: before.id } })), before);
  });

  await t.test('partial observations cannot clear review for retained ambiguous education, but a correction can', async () => {
    const source = ingestSource(sourceIds[0]);
    const job = ingestJob(source.sourceId, 'review-retention');
    await ingestJobs(source, [{ ...job, educationRaw: '本科优先' }], write);
    const partial = { ...job, educationRaw: null, requirements: '三年运营经验' };
    const retained = await ingestJobs(source, [partial], write);
    assert.equal(retained.review, 1); assert.ok(retained.rows[0].reviewReasons?.includes('EDUCATION_UNCERTAIN'));
    const before = storedJob(await client.job.findUniqueOrThrow({ where: { id: retained.rows[0].id! } }));
    assert.equal(before.job.educationRaw, '本科优先'); assert.equal(before.job.visibility, 'review');
    const fixed = await ingestJobs(source, [{ ...partial, educationRaw: '本科及以上学历' }], write);
    assert.equal(fixed.review, 0);
    const after = storedJob(await client.job.findUniqueOrThrow({ where: { id: fixed.rows[0].id! } }));
    assert.equal(after.job.minimumDegree, 'bachelor'); assert.equal(after.job.visibility, 'hidden');
  });

  await t.test('application method changes clear old-channel instructions while same-method omissions preserve them', async () => {
    const source = ingestSource(sourceIds[0]);
    const job = ingestJob(source.sourceId, 'application-route');
    const first = await ingestJobs(source, [{ ...job, applicationMethod: 'offline', applicationInstructions: '请到深圳现场提交纸质材料' }], write);
    const web = { ...job, applicationMethod: 'web_form' as const, applyUrl: 'https://fixture.invalid/apply/new', applicationInstructions: null };
    const changed = await ingestJobs(source, [web], write);
    assert.equal(changed.updated, 1); assert.equal(changed.rows[0].id, first.rows[0].id);
    const switched = storedJob(await client.job.findUniqueOrThrow({ where: { id: changed.rows[0].id! } }));
    assert.equal(switched.job.applicationMethod, 'web_form'); assert.equal(switched.job.applyUrl, web.applyUrl);
    assert.equal(switched.job.applicationInstructions, null);
    await ingestJobs(source, [{ ...web, applicationInstructions: '表单中请上传PDF简历' }], write);
    const partial = await ingestJobs(source, [web], write);
    assert.equal(partial.duplicates, 1);
    const retained = storedJob(await client.job.findUniqueOrThrow({ where: { id: partial.rows[0].id! } }));
    assert.equal(retained.job.applicationInstructions, '表单中请上传PDF简历');
  });
});
