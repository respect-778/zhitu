import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContractError, JobSchema, ReviewedMetadataSchema, type Job, type ReviewedMetadata } from '../contracts/index.ts';
import { Prisma, type Job as JobRow, type PrismaClient } from '../src/generated/prisma/client.ts';
import { mergeUpsertJob, storedJob, upsertJob } from '../src/storage/jobs.ts';
import { mergeJobSnapshots, sameJobContent } from '../src/storage/merge.ts';
import { publicJobSummary } from '../src/storage/public-job.ts';
import { ingestJob, ingestSource } from './fixtures/ingest.ts';

const id = '00000000-0000-4000-8000-000000000001';
const metadata: ReviewedMetadata = {
  batchId: 'official100-2026-11-11', industry: '软件与信息技术', companyType: '未披露（企业主体）',
  graduateYear: '2027届、2028届', graduateStatus: '正文明确毕业届数',
  graduateQuote: '面向2027届及2028届毕业的在校生', graduateSourceUrl: 'https://fixture.invalid/jobs/1',
};
const job = (): Job => ({ ...ingestJob(), minimumDegree: 'bachelor', cityCodes: ['440300'] });

function databaseRow(input: Job, reviewedMetadata: unknown = input.reviewedMetadata ?? null): JobRow {
  return { ...input, id, reviewedMetadata, cityCodes: input.cityCodes ?? [], minimumDegree: input.minimumDegree ?? null,
    salary: input.salary ?? null, firstSeenAt: new Date(input.firstSeenAt), lastSeenAt: new Date(input.lastSeenAt),
    lastVerifiedAt: input.lastVerifiedAt ? new Date(input.lastVerifiedAt) : null,
    closedAt: input.closedAt ? new Date(input.closedAt) : null, createdAt: new Date(), updatedAt: new Date() } as JobRow;
}

/** Exercise the real storage transaction and JSON mapping without opening a database connection. */
function memoryStorage() {
  let row: JobRow | null = null;
  const save = (data: Record<string, unknown>) => {
    const fields = { ...data };
    for (const key of ['salary', 'publishedAt', 'sourceUpdatedAt', 'deadlineAt', 'reviewedMetadata']) {
      if (fields[key] === Prisma.DbNull) fields[key] = null;
    }
    row = { ...fields, id, createdAt: new Date(), updatedAt: new Date() } as JobRow;
    return row;
  };
  const transaction = {
    source: { upsert: async ({ create }: { create: unknown }) => create, update: async ({ data }: { data: unknown }) => data },
    job: {
      findUnique: async () => row,
      upsert: async ({ create }: { create: Record<string, unknown> }) => save(create),
      update: async ({ data }: { data: Record<string, unknown> }) => { row = { ...row!, ...data }; return row; },
    },
  };
  const client = { $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(transaction) } as unknown as PrismaClient;
  return { client, row: () => row! };
}

test('reviewed metadata is optional for old inputs and strictly validates its complete object and HTTPS source', () => {
  assert.deepEqual(JobSchema.parse(job()), job());
  assert.deepEqual(JobSchema.parse({ ...job(), reviewedMetadata: undefined }), job());
  assert.equal(JobSchema.parse({ ...job(), reviewedMetadata: null }).reviewedMetadata, null);
  assert.deepEqual(ReviewedMetadataSchema.parse(metadata), metadata);
  assert.deepEqual(ReviewedMetadataSchema.parse({ ...metadata, graduateQuote: null, graduateSourceUrl: null }),
    { ...metadata, graduateQuote: null, graduateSourceUrl: null });
  for (const patch of [{ extra: true }, { industry: '' }, { graduateStatus: undefined }, { batchId: ' batch ' },
    { graduateQuote: '' }, { graduateQuote: 2027 }, { graduateSourceUrl: 'http://fixture.invalid/jobs/1' },
    { graduateSourceUrl: 'https://user:password@fixture.invalid/jobs/1' }, { graduateSourceUrl: 'https://fixture.invalid/\\bad' }]) {
    assert.throws(() => JobSchema.parse({ ...job(), reviewedMetadata: { ...metadata, ...patch } }), ContractError);
  }
});

test('stored null metadata and old public DTOs retain their previous shape while reviewed objects project intact', () => {
  const old = storedJob(databaseRow(job())).job;
  assert.deepEqual(old, job());
  assert.equal(Object.hasOwn(old, 'reviewedMetadata'), false);
  assert.equal(Object.hasOwn(publicJobSummary(id, old, ingestSource()), 'reviewedMetadata'), false);
  const reviewed = storedJob(databaseRow({ ...job(), reviewedMetadata: metadata })).job;
  assert.deepEqual(reviewed.reviewedMetadata, metadata);
  const summary = publicJobSummary(id, reviewed, ingestSource());
  assert.deepEqual(summary.reviewedMetadata, metadata);
  for (const privateField of ['evidence', 'visibility', 'requirements', 'adapter']) assert.equal(Object.hasOwn(summary, privateField), false);
});

test('partial merge retains absent metadata and replaces a newly reviewed object as one group', () => {
  const previous = { ...job(), reviewedMetadata: metadata };
  for (const incoming of [job(), { ...job(), reviewedMetadata: undefined }, { ...job(), reviewedMetadata: null }]) {
    const merged = mergeJobSnapshots(previous, incoming);
    assert.deepEqual(merged.reviewedMetadata, metadata);
    assert.equal(sameJobContent(previous, merged), true);
  }
  const replacement = { ...metadata, industry: '科研与技术服务', graduateYear: '未明示届数（在校/在读资格）',
    graduateStatus: '正文仅要求在读', graduateQuote: null, graduateSourceUrl: null };
  const merged = mergeJobSnapshots(previous, { ...job(), reviewedMetadata: replacement });
  assert.deepEqual(merged.reviewedMetadata, replacement);
  assert.equal(sameJobContent(previous, merged), false);
});

test('identical hidden retries preserve publication while changed or unsafe content follows normal review flow', () => {
  const previous = { ...job(), reviewedMetadata: metadata, visibility: 'published' as const };
  const incoming = { ...previous, visibility: 'hidden' as const, lastSeenAt: '2026-11-09T02:00:00.000Z',
    lastVerifiedAt: '2026-11-09T02:00:00.000Z' };
  assert.equal(mergeJobSnapshots(previous, incoming).visibility, 'published');
  assert.equal(mergeJobSnapshots(previous, { ...incoming, reviewedMetadata: null }).visibility, 'published');
  assert.equal(mergeJobSnapshots(previous, { ...incoming, title: '更新后的岗位' }).visibility, 'hidden');
  assert.equal(mergeJobSnapshots(previous, { ...incoming, reviewedMetadata: { ...metadata, graduateYear: '2029届' } }).visibility, 'hidden');
  assert.equal(mergeJobSnapshots(previous, { ...incoming, title: '<script>bad</script>' }).visibility, 'review');
  assert.equal(mergeJobSnapshots(previous, { ...incoming, visibility: 'review' }).visibility, 'review');
});

test('storage persists reviewed metadata, retains missing values across both write APIs and ignores late replacements', async () => {
  const storage = memoryStorage();
  const first = await mergeUpsertJob(storage.client, ingestSource(), { ...job(), reviewedMetadata: metadata });
  assert.equal(first.outcome, 'inserted');
  assert.deepEqual(first.job.reviewedMetadata, metadata);
  assert.deepEqual(storedJob(storage.row()).job.reviewedMetadata, metadata);
  for (const reviewedMetadata of [undefined, null]) {
    const complete = await upsertJob(storage.client, ingestSource(), { ...job(), reviewedMetadata });
    assert.equal(complete.id, first.id);
    assert.deepEqual(complete.job.reviewedMetadata, metadata);
    const partial = await mergeUpsertJob(storage.client, ingestSource(), { ...job(), reviewedMetadata });
    assert.equal(partial.outcome, 'duplicate');
    assert.deepEqual(partial.job.reviewedMetadata, metadata);
  }
  const replacement = { ...metadata, graduateYear: '2029届', graduateQuote: null, graduateSourceUrl: null };
  const changed = await mergeUpsertJob(storage.client, ingestSource(), { ...job(), reviewedMetadata: replacement,
    firstSeenAt: '2026-11-09T02:00:00.000Z', lastSeenAt: '2026-11-09T02:00:00.000Z' });
  assert.equal(changed.outcome, 'updated');
  assert.deepEqual(changed.job.reviewedMetadata, replacement);
  const late = await mergeUpsertJob(storage.client, ingestSource(), { ...job(), reviewedMetadata: metadata,
    firstSeenAt: '2026-11-09T00:00:00.000Z' });
  assert.equal(late.outcome, 'duplicate');
  assert.deepEqual(late.job.reviewedMetadata, replacement);
  assert.equal(late.job.firstSeenAt, '2026-11-09T00:00:00.000Z');
  const oldStorage = memoryStorage();
  const old = await upsertJob(oldStorage.client, ingestSource(), job());
  assert.deepEqual(old.job, job());
  assert.equal(Object.hasOwn(old.job, 'reviewedMetadata'), false);
});
