import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { loadTencentSource } from '../src/config/sources.ts';
import { readTencentDetail, readTencentPost, tencentDetailUrl, tencentDetailApiUrl } from '../src/adapters/tencent.ts';
import { ingestJobs } from '../src/worker/ingest.ts';
import { CaptureError, checkInputPath, MAX_CAPTURE_BYTES, parseTencentCapture, readCaptureFile, readIngestOptions } from '../src/worker/capture.ts';
import { observed } from './fixtures/ingest.ts';

async function capture() {
  const source = await loadTencentSource();
  const list = JSON.parse(await readFile(new URL('./fixtures/tencent/list.json', import.meta.url), 'utf8'));
  const detail = JSON.parse(await readFile(new URL('./fixtures/tencent/detail.json', import.meta.url), 'utf8'));
  const job = readTencentDetail(detail, readTencentPost(list.Data.Posts[0]), source, observed);
  return { mode: 'tencent', synthetic: false, persisted: false, source, jobs: [job],
    pages: [{ sourceId: source.sourceId, scopeKey: source.scopeKey,
      items: [{ sourceId: job.sourceId, sourceJobId: job.sourceJobId, detailUrl: job.detailUrl }], excluded: 0, exclusions: [],
      reportedTotal: 20, nextCursor: '2', hasMore: true, completeness: 'partial', stopReason: 'max_pages' }], attempts: {},
    report: { runId: 't07-captured-fixture', sourceId: source.sourceId, scopeKey: source.scopeKey, status: 'partial',
      startedAt: observed, finishedAt: observed, pagesRead: 1, recordsSeen: 1, accepted: 1, rejected: 0, duplicateIds: 0, requestFailures: 0,
      excluded: 0, exclusions: [], reportedTotal: 20, nextCursor: '2', hasMore: true, coverageComplete: false, stopReason: 'max_pages' } };
}

test('capture keeps collector accounting separate and lets malformed jobs reach individual rejection', async () => {
  const input = await capture();
  const parsed = parseTencentCapture(input, input.source);
  assert.deepEqual(parsed.collectionReport, input.report); assert.equal(parsed.jobs.length, 1);
  const malformed = parseTencentCapture({ ...input, jobs: [{ sourceJobId: 1 }] }, input.source);
  assert.deepEqual(malformed.jobs, [{ sourceJobId: 1 }]);
});

test('capture binds every ingestible identity to list evidence and rejects substitution, duplicates and absent list proof', async () => {
  const input = await capture();
  const substituted = { ...input.jobs[0], sourceJobId: '123', sourceUrl: tencentDetailUrl('123'), detailUrl: tencentDetailUrl('123'),
    evidence: input.jobs[0].evidence.map(item => ({ ...item, sourceUrl: tencentDetailApiUrl('123') })) };
  for (const job of [substituted, { ...substituted, responsibilities: '   ' }]) {
    assert.throws(() => parseTencentCapture({ ...input, jobs: [job] }, input.source), CaptureError);
  }
  const two = { ...input, jobs: [input.jobs[0], input.jobs[0]],
    pages: [{ ...input.pages[0], items: [...input.pages[0].items, { sourceId: substituted.sourceId, sourceJobId: substituted.sourceJobId, detailUrl: substituted.detailUrl }] }],
    report: { ...input.report, recordsSeen: 2, accepted: 2 } };
  assert.throws(() => parseTencentCapture(two, input.source), CaptureError);
  assert.throws(() => parseTencentCapture({ ...input, pages: [] }, input.source), CaptureError);
  assert.throws(() => parseTencentCapture({ ...input, pages: [{ ...input.pages[0], items: [{ ...input.pages[0].items[0], detailUrl: tencentDetailUrl('123') }] }] }, input.source), CaptureError);
});

test('a malformed individual row remains counted as rejected while a list-backed good row can be ingested', async () => {
  const input = await capture();
  const broken = { ...input.jobs[0], sourceJobId: 123, title: null };
  const parsed = parseTencentCapture({ ...input, jobs: [input.jobs[0], broken],
    report: { ...input.report, recordsSeen: 2, accepted: 2 } }, input.source);
  const written: string[] = [];
  const report = await ingestJobs(parsed.source, parsed.jobs, async (_source, job) => {
    written.push(job.sourceJobId); return { id: 'test-id', job, outcome: 'inserted' };
  });
  assert.deepEqual(written, [input.jobs[0].sourceJobId]);
  assert.deepEqual([report.accepted, report.rejected], [1, 1]);
  assert.equal(report.rows[1].index, 1); assert.equal(report.rows[1].reason, 'INVALID_JOB');
});

test('synthetic, source/scope/config substitutions, count mismatches and oversized batches fail closed', async () => {
  const input = await capture();
  for (const value of [{ ...input, synthetic: true }, { ...input, synthetic: undefined }, { ...input, persisted: true },
    { ...input, source: { ...input.source, enabled: true } }, { ...input, source: { ...input.source, kind: 'announcement' } },
    { ...input, report: { ...input.report, scopeKey: 'other' } }, { ...input, jobs: [] }, { ...input, jobs: Array(1001).fill(input.jobs[0]) },
    { ...input, extra: 'not-accepted' }]) assert.throws(() => parseTencentCapture(value, input.source), CaptureError);
});

test('changing only a partial report into complete cannot override capped pages and their original total', async () => {
  const input = await capture();
  assert.throws(() => parseTencentCapture({ ...input, report: { ...input.report,
    status: 'complete', coverageComplete: true, reportedTotal: 1, hasMore: false, nextCursor: null, stopReason: 'exhausted',
  } }, input.source), CaptureError);
});

test('complete capture requires all pages, matching totals/accounting, ordered continuation and an exhausted last page', async () => {
  const input = await capture();
  const second = { ...input.jobs[0], sourceJobId: '123', sourceUrl: tencentDetailUrl('123'), detailUrl: tencentDetailUrl('123'),
    evidence: input.jobs[0].evidence.map(item => ({ ...item, sourceUrl: tencentDetailApiUrl('123') })) };
  const exclusion = { count: 1, reason: 'outside_scope', ruleId: 'tencent-native-source-id-v1',
    evidence: { sourceUrl: 'https://careers.tencent.com/tencentcareer/api/post/Query?pageIndex=2&pageSize=2&language=zh-cn',
      observedAt: observed, parserVersion: 'tencent-native-v1', locator: '$.Data.Posts[1].SourceID=4;PostId=456' } };
  const complete = { ...input, jobs: [input.jobs[0], second],
    pages: [{ ...input.pages[0], reportedTotal: 3, stopReason: 'more_pages' },
      { ...input.pages[0], items: [{ sourceId: second.sourceId, sourceJobId: second.sourceJobId, detailUrl: second.detailUrl }],
        reportedTotal: 3, excluded: 1, exclusions: [exclusion], completeness: 'complete', stopReason: 'exhausted', hasMore: false, nextCursor: null }],
    report: { ...input.report, pagesRead: 2, recordsSeen: 3, accepted: 2, excluded: 1, exclusions: [exclusion],
      status: 'complete', coverageComplete: true, reportedTotal: 3, hasMore: false, nextCursor: null, stopReason: 'exhausted' } };
  assert.equal(parseTencentCapture(complete, input.source).collectionReport.status, 'complete');
  for (const invalid of [
    { ...complete, report: { ...complete.report, pagesRead: 3 } },
    { ...complete, pages: [{ ...complete.pages[0], reportedTotal: 20 }, complete.pages[1]] },
    { ...complete, pages: [{ ...complete.pages[0], nextCursor: '3' }, complete.pages[1]] },
    { ...complete, pages: [{ ...complete.pages[0], stopReason: 'max_pages' }, complete.pages[1]] },
    { ...complete, pages: [{ ...complete.pages[0], completeness: 'complete', stopReason: 'exhausted', hasMore: false, nextCursor: null }, complete.pages[1]] },
    { ...complete, pages: [complete.pages[0], { ...complete.pages[1], completeness: 'partial', stopReason: 'max_pages', hasMore: true, nextCursor: '3' }] },
    { ...complete, pages: [complete.pages[0], { ...complete.pages[1], excluded: 0, exclusions: [] }] },
    { ...complete, report: { ...complete.report, exclusions: [{ ...exclusion, ruleId: 'different-scope-evidence' }] } },
    { ...complete, jobs: [input.jobs[0], { sourceJobId: 123 }], pages: [complete.pages[0], { ...complete.pages[1], items: [] }] },
  ]) assert.throws(() => parseTencentCapture(invalid, input.source), CaptureError);
  // A malformed individual DTO still reaches the per-item reject path when the complete listing proof itself is intact.
  assert.equal(parseTencentCapture({ ...complete, jobs: [input.jobs[0], { sourceJobId: 123 }] }, input.source).jobs.length, 2);
  const empty = { ...input, jobs: [], pages: [{ ...input.pages[0], items: [], reportedTotal: 0,
    completeness: 'complete', stopReason: 'exhausted', hasMore: false, nextCursor: null }],
    report: { ...input.report, recordsSeen: 0, accepted: 0, status: 'complete', coverageComplete: true,
      reportedTotal: 0, hasMore: false, nextCursor: null, stopReason: 'exhausted' } };
  assert.equal(parseTencentCapture(empty, input.source).collectionReport.status, 'complete');
});

test('partial capture retains changing totals, continuation request failure and missing invalid-page evidence semantics', async () => {
  const input = await capture();
  const scenarios = [
    { ...input, pages: [{ ...input.pages[0], reportedTotal: 21, stopReason: 'total_mismatch', hasMore: null, nextCursor: null }],
      report: { ...input.report, stopReason: 'total_mismatch', hasMore: null, nextCursor: null } },
    { ...input, pages: [{ ...input.pages[0], stopReason: 'more_pages' }],
      report: { ...input.report, stopReason: 'request_failed', requestFailures: 1 } },
    { ...input, report: { ...input.report, pagesRead: 2, recordsSeen: 2, rejected: 1, stopReason: 'parse_failed' } },
  ];
  for (const scenario of scenarios) assert.equal(parseTencentCapture(scenario, input.source).collectionReport.status, 'partial');
});

test('file options require an exact explicit source and absolute non-sensitive JSON path', () => {
  const input = resolve('capture.json');
  assert.deepEqual(readIngestOptions(['--source', 'tencent-native', '--input', input]), { input });
  for (const args of [[], ['--input', input], ['--source', 'other', '--input', input], ['--source', 'tencent-native', '--input', input, '--allow-synthetic']]) assert.throws(() => readIngestOptions(args));
  for (const path of ['capture.json', resolve('capture.txt'), resolve('.env.json'), resolve('private', 'capture.json'), resolve('credentials.json'), resolve('.ssh', 'capture.json'), `${input}:stream`, `${resolve('captures')}/../capture.json`]) assert.throws(() => checkInputPath(path), CaptureError);
});

test('Linux bounded reader rejects directories, symlinks including ancestors, invalid UTF-8/JSON and oversized files', {
  skip: process.platform === 'linux' ? false : 'Formal file ingestion is Linux-only; Windows reparse-point guarantees are not claimed.',
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 't07-capture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'capture.json');
  await writeFile(file, '{"safe":true}'); assert.deepEqual(await readCaptureFile(file), { safe: true });
  const link = join(directory, 'link.json'); await symlink(file, link); await assert.rejects(readCaptureFile(link), CaptureError);
  const folder = join(directory, 'folder.json'); await mkdir(folder); await assert.rejects(readCaptureFile(folder), CaptureError);
  const parentLink = join(directory, 'linked'); await symlink(directory, parentLink); await assert.rejects(readCaptureFile(join(parentLink, 'capture.json')), CaptureError);
  await writeFile(file, Buffer.from([0xc3, 0x28])); await assert.rejects(readCaptureFile(file), CaptureError);
  await writeFile(file, '{not json'); await assert.rejects(readCaptureFile(file), CaptureError);
  await truncate(file, MAX_CAPTURE_BYTES + 1); await assert.rejects(readCaptureFile(file), CaptureError);
});

test('non-Linux rejects before attempting to read input', { skip: process.platform === 'linux' }, async () => {
  await assert.rejects(readCaptureFile(resolve('missing-capture.json')), error => error instanceof CaptureError && error.code === 'PLATFORM_UNSUPPORTED');
});
