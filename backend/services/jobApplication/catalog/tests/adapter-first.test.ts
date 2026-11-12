import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JobSchema, ListPageSchema, RunReportSchema } from '../contracts/index.ts';
import { loadTencentSource } from '../src/config/sources.ts';
import { readTencentDetail, readTencentList, readTencentPost, tencentListUrl, TencentParseError } from '../src/adapters/tencent.ts';
import { checkTencentOptions, runTencent } from '../src/worker/run-tencent.ts';
import { assertSafeNetworkEnvironment, readTencentVerificationOptions } from '../src/worker/verify-tencent.ts';

const list = JSON.parse(await readFile(new URL('./fixtures/tencent/list.json', import.meta.url), 'utf8'));
const detail = JSON.parse(await readFile(new URL('./fixtures/tencent/detail.json', import.meta.url), 'utf8'));
const observed = '2026-11-09T01:00:00.000Z';
const post = (id: string, source = 1) => ({ ...list.Data.Posts[0], PostId: id, SourceID: source });
const page = (count: number, posts: unknown[]) => ({ Code: 200, Data: { Count: count, Posts: posts } });
const detailFor = (id: string, requirement = '完整条件（合成）') => ({ ...detail, Data: { ...detail.Data, PostId: id, Requirement: requirement } });

test('fixed Tencent operations sample preserves full text, 19-digit ID and update date without inventing apply/published fields', async () => {
  const source = await loadTencentSource();
  assert.equal(source.enabled, false);
  assert.equal(source.sourceId, 'tencent-native');
  const parsedList = readTencentList(list, 2);
  assert.equal(parsedList.total, 2191);
  assert.equal(parsedList.posts.length, 2);
  const parsedPost = readTencentPost(parsedList.posts[0]);
  const job = readTencentDetail(detail, parsedPost, source, observed);
  JobSchema.parse(job);
  assert.equal(job.sourceJobId, '2093163274496552960');
  assert.match(job.title, /运营岗/);
  assert.equal(job.requirements, detail.Data.Requirement);
  assert.equal(job.responsibilities, detail.Data.Responsibility);
  assert.deepEqual(job.sourceUpdatedAt, { raw: '2026年11月09日', value: '2026-11-09', precision: 'day', timezone: null });
  assert.equal(job.publishedAt, null); assert.equal(job.deadlineAt, null);
  assert.equal(job.applyUrl, null); assert.equal(job.applicationMethod, 'unknown');
  assert.equal(job.employmentType, 'unknown'); assert.equal(job.recruitmentChannel, 'social');
  assert.equal(job.visibility, 'hidden'); assert.equal(job.lastVerifiedAt, observed);
  assert.equal(job.detailUrl, 'https://careers.tencent.com/jobdesc.html?postId=2093163274496552960');
  const url = new URL(tencentListUrl(2, 50));
  assert.deepEqual([...url.searchParams.keys()].sort(), ['language', 'pageIndex', 'pageSize']);
  assert.equal(url.searchParams.get('pageIndex'), '2');
  assert.equal(url.searchParams.get('language'), 'zh-cn');
});

test('adapter rejects numeric identity, invalid envelope, unknown scope, stale/empty/mismatched detail; keeps unparsed date raw', async () => {
  const source = await loadTencentSource();
  for (const input of [null, {}, { Code: 0, Data: list.Data }, page(-1, []), page(1, null as unknown as unknown[])]) {
    assert.throws(() => readTencentList(input, 2), TencentParseError);
  }
  for (const input of [post('1', 7), { ...post('1'), IsValid: false }, { ...post('1'), PostId: 2093163274496552960 }, { ...post('1'), RecruitPostName: '' }]) {
    assert.throws(() => readTencentPost(input), TencentParseError);
  }
  for (const changes of [{ PostId: '2' }, { SourceID: 4 }, { Requirement: '' }, { Responsibility: null }, { IsValid: false }]) {
    assert.throws(() => readTencentDetail({ Code: 200, Data: { ...detailFor('1').Data, ...changes } }, readTencentPost(post('1')), source, observed));
  }
  const value = readTencentDetail({ Code: 200, Data: { ...detailFor('1').Data, LastUpdateTime: '2026年02月30日' } }, readTencentPost(post('1')), source, observed);
  assert.deepEqual(value.sourceUpdatedAt, { raw: '2026年02月30日', value: null, precision: null, timezone: null });
});

test('runner exhausts pages, records native/Workday accounting, refreshes details on the next run and retains non-technical jobs', async () => {
  let revision = '第一轮完整任职条件';
  const detailCalls: string[] = [];
  const getter = async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/Query')) return url.searchParams.get('pageIndex') === '1' ? page(3, [post('1'), post('2', 4)]) : page(3, [post('3')]);
    const id = url.searchParams.get('postId')!;
    detailCalls.push(id); return detailFor(id, revision);
  };
  for (let iteration = 0; iteration < 2; iteration++) {
    const result = await runTencent({ maxPages: 2, pageSize: 2, maxDetails: 4 }, getter);
    RunReportSchema.parse(result.report); result.pages.forEach(value => ListPageSchema.parse(value));
    assert.equal(result.synthetic, true); assert.equal(result.persisted, false);
    assert.deepEqual([result.report.recordsSeen, result.report.accepted, result.report.excluded, result.report.reportedTotal], [3, 2, 1, 3]);
    assert.equal(result.report.status, 'complete'); assert.equal(result.report.pagesRead, 2);
    assert.match(result.report.exclusions[0].evidence.locator!, /Posts\[1\]\.SourceID=4/);
    assert.ok(result.jobs.every(job => job.requirements === revision && /运营/.test(job.title)));
    revision = '第二轮更新后的完整任职条件';
  }
  assert.deepEqual(detailCalls, ['1', '3', '1', '3']);
});

test('runner returns complete for a proved empty scope or all evidenced outside-scope posts', async () => {
  for (const raw of [page(0, []), page(2, [post('1', 4), post('2', 4)])]) {
    const result = await runTencent({ maxPages: 1, pageSize: 2, maxDetails: 2 }, async () => raw);
    assert.equal(result.report.status, 'complete');
    assert.equal(result.report.accepted, 0); assert.equal(result.report.rejected, 0);
    assert.equal(result.report.excluded, raw.Data.Posts.length);
  }
});

test('runner retains both operations and technical jobs and continues beyond the upstream 2000-row single-page ceiling', async () => {
  const requestedPages: number[] = [];
  const titles = new Map<string, string>(list.Data.Posts.map((value: { PostId: string; RecruitPostName: string }) => [value.PostId, value.RecruitPostName]));
  const native = list.Data.Posts as { PostId: string; RecruitPostName: string }[];
  const count = 2001;
  const result = await runTencent({ maxPages: 21, pageSize: 100, maxDetails: 2100 }, async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/Query')) {
      const index = Number(url.searchParams.get('pageIndex'));
      requestedPages.push(index);
      const start = (index - 1) * 100;
      return page(count, Array.from({ length: Math.min(100, count - start) }, (_, offset) => {
        const row = start + offset;
        return row < native.length ? native[row] : post(String(row + 1), 4);
      }));
    }
    const id = url.searchParams.get('postId')!;
    return { Code: 200, Data: { ...detailFor(id).Data, RecruitPostName: titles.get(id) } };
  });
  assert.equal(result.report.status, 'complete'); assert.equal(result.report.reportedTotal, count);
  assert.equal(result.report.recordsSeen, count); assert.equal(result.report.pagesRead, 21);
  assert.equal(result.report.accepted, 2); assert.equal(result.report.excluded, 1999);
  assert.deepEqual(requestedPages, Array.from({ length: 21 }, (_, index) => index + 1));
  assert.deepEqual(result.jobs.map(job => job.title), native.map(value => value.RecruitPostName));
  assert.match(result.jobs[0].title, /运营岗/); assert.match(result.jobs[1].title, /客户端开发工程师/);
});

test('caps, gaps, changing totals, duplicate pages/IDs, malformed rows and invalid list envelopes never claim completeness', async t => {
  const cases = [
    { name: 'cap', pages: [page(3, [post('1'), post('2')])], max: 1, reason: 'max_pages', seen: 2 },
    { name: 'gap', pages: [page(3, [post('1')])], max: 2, reason: 'total_mismatch', seen: 1 },
    { name: 'empty gap', pages: [page(3, [])], max: 2, reason: 'total_mismatch', seen: 0 },
    { name: 'changed total', pages: [page(3, [post('1'), post('2')]), page(4, [post('3'), post('4')])], max: 2, reason: 'total_mismatch', seen: 4 },
    { name: 'repeated page', pages: [page(4, [post('1'), post('2')]), page(4, [post('1'), post('2')])], max: 2, reason: 'repeated_page', seen: 4 },
    { name: 'duplicate ID', pages: [page(2, [post('1'), post('1')])], max: 1, reason: 'repeated_page', seen: 2 },
    { name: 'unknown source', pages: [page(2, [post('1'), post('2', 9)])], max: 1, reason: 'parse_failed', seen: 2 },
    { name: 'invalid post', pages: [page(2, [post('1', 4), { ...post('2', 4), IsValid: false }])], max: 1, reason: 'parse_failed', seen: 2 },
    { name: 'count below page', pages: [page(0, [post('1')])], max: 1, reason: 'total_mismatch', seen: 1 },
    { name: 'invalid envelope', pages: [{ Code: 200, Data: null }], max: 1, reason: 'parse_failed', seen: 0 },
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => {
    const result = await runTencent({ maxPages: scenario.max, pageSize: 2, maxDetails: scenario.max * 2 }, async input => {
      const url = new URL(input);
      return url.pathname.endsWith('/Query') ? scenario.pages[Number(url.searchParams.get('pageIndex')) - 1] : detailFor(url.searchParams.get('postId')!);
    });
    const report = RunReportSchema.parse(result.report);
    assert.equal(report.coverageComplete, false); assert.equal(report.stopReason, scenario.reason);
    assert.equal(report.recordsSeen, scenario.seen);
    assert.equal(report.accepted + report.rejected + report.duplicateIds + report.excluded, report.recordsSeen);
    if (scenario.name === 'invalid post') { assert.equal(report.excluded, 1); assert.equal(report.rejected, 1); }
    if (scenario.name === 'empty gap') assert.equal(report.pagesRead, 1);
  });
});

test('Crawlee retries one request, counts only unrecovered failures and rejects bad details without losing accounting', async () => {
  let calls = 0;
  const recovered = await runTencent({ maxPages: 1, pageSize: 1, maxDetails: 1 }, async input => {
    if (input.includes('/Query')) { if (++calls === 1) throw new Error('SYNTHETIC'); return page(1, [post('1')]); }
    return detailFor('1');
  });
  assert.equal(recovered.report.status, 'complete'); assert.equal(recovered.report.requestFailures, 0);
  assert.equal(recovered.attempts['page:1'], 2);
  for (const mode of ['list', 'detail', 'wrong-id'] as const) {
    const result = await runTencent({ maxPages: 1, pageSize: 1, maxDetails: 1 }, async input => {
      if (input.includes('/Query')) { if (mode === 'list') throw new Error('SECRET_NOT_TO_LOG'); return page(1, [post('1')]); }
      if (mode === 'detail') throw new Error('SECRET_NOT_TO_LOG');
      return detailFor('2');
    });
    assert.equal(result.report.coverageComplete, false);
    assert.equal(result.report.requestFailures, mode === 'wrong-id' ? 0 : 1);
    assert.equal(result.report.rejected, mode === 'list' ? 0 : 1);
    assert.ok(!JSON.stringify(result).includes('SECRET_NOT_TO_LOG'));
  }
});

test('live CLI requires explicit bounded selection, clean network environment and adequate detail budget', async () => {
  const args = ['--verify-live', '--source', 'tencent-native', '--max-pages', '2', '--page-size', '2', '--max-details', '4'];
  assert.deepEqual(readTencentVerificationOptions(args), { verifyLive: true, maxPages: 2, pageSize: 2, maxDetails: 4 });
  for (const bad of [[], args.slice(1), [...args, '--url', 'https://evil.invalid'], args.map(value => value === '2' ? '1e2' : value)]) assert.throws(() => readTencentVerificationOptions(bad));
  assert.throws(() => checkTencentOptions({ maxPages: 2, pageSize: 2, maxDetails: 1 }));
  await assert.rejects(runTencent({ maxPages: 1, pageSize: 1, maxDetails: 1 }), /requires explicit/);
  assertSafeNetworkEnvironment({});
  for (const name of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSLKEYLOGFILE', 'HTTPS_PROXY', 'http_proxy', 'NODE_USE_ENV_PROXY']) {
    assert.throws(() => assertSafeNetworkEnvironment({ [name]: 'SECRET' }), error => error instanceof Error && !error.message.includes('SECRET'));
  }
});
