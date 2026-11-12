import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { internshipDetailApiUrl, internshipDetailUrl, internshipId, internshipListBody, internshipPlainText,
  readInternshipDetail, readInternshipList, readInternshipPost, readInternshipProjectMapping, TencentInternshipParseError } from '../src/adapters/tencent-internship.ts';
import { loadTencentInternshipSource, loadTrustedSources } from '../src/config/sources.ts';
import { HttpBoundaryError } from '../src/http/controlled-get.ts';
import { normalizeJob } from '../src/normalize/job.ts';
import { createPublicationPolicy } from '../src/storage/publication-policy.ts';
import { readPublishOptions } from '../src/storage/publish-cli.ts';
import { CaptureError } from '../src/worker/capture.ts';
import { collectTencentInternships, readInternshipCollectionOptions } from '../src/worker/collect-tencent-internship.ts';
import { readInternshipIngestOptions } from '../src/worker/ingest-internship-capture.ts';
import { parseTencentInternshipCapture } from '../src/worker/internship-capture.ts';

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`./fixtures/tencent-internship/${name}.json`, import.meta.url), 'utf8'));
const mapping = await fixture('project-mapping'), list = await fixture('list');
const ordinary = await fixture('ordinary-detail'), qingyun = await fixture('qingyun-detail');
const observedAt = '2026-11-09T12:00:00.000Z';
const listPost = (id: string) => ({ ...list.data.positionList[0], postId: id });
const detailFor = (id: string) => ({ ...ordinary, data: { ...ordinary.data, postId: id } });
function transport(rows: unknown[], options: { total?: number; failId?: string; invalidId?: string } = {}) {
  const calls: string[] = [];
  return {
    calls,
    async get(url: string) {
      calls.push(url);
      if (url.endsWith('getProjectMapping')) return structuredClone(mapping);
      const id = new URL(url).searchParams.get('postId')!;
      if (id === options.failId) throw new HttpBoundaryError('HTTP_READ_TIMEOUT');
      const detail = detailFor(id);
      if (id === options.invalidId) detail.data.recruitType = 1;
      return detail;
    },
    async post(url: string, body: string) {
      calls.push(url);
      const { pageIndex, pageSize } = JSON.parse(body);
      assert.equal(pageSize, 100);
      return { status: 0, data: { count: options.total ?? rows.length, positionList: rows.slice((pageIndex - 1) * 100, pageIndex * 100) } };
    },
  };
}

test('official mapping and detail samples retain full text, 19-digit IDs, explicit internship type and official detail URLs', async () => {
  const source = await loadTencentInternshipSource();
  assert.equal(source.enabled, false);
  assert.deepEqual((await loadTrustedSources()).slice(0, 2).map(source => source.sourceId), ['tencent-native', 'tencent-internship']);
  readInternshipProjectMapping(mapping);
  const post = readInternshipPost(readInternshipList(list).posts[0])!;
  const normal = readInternshipDetail(ordinary, post, source, observedAt);
  const qingyunPost = { id: qingyun.data.postId, title: qingyun.data.title };
  const topic = readInternshipDetail(qingyun, qingyunPost, source, observedAt);
  assert.equal(normal.sourceJobId, '1200791473415778304');
  assert.equal(normal.requirements, ordinary.data.request);
  assert.equal(topic.responsibilities, qingyun.data.topicDetail);
  assert.equal(topic.requirements, qingyun.data.topicRequirement);
  assert.equal(topic.applicationInstructions, qingyun.data.internBonus);
  const normalizedNormal = normalizeJob(normal, source).job;
  assert.equal(normalizedNormal.locationRaw, '深圳总部、北京、上海、广州、成都、杭州');
  assert.deepEqual(normalizedNormal.cityCodes, ['440300', '110000', '310000', '440100', '510100', '330100']);
  for (const job of [normal, topic]) {
    assert.equal(job.employmentType, 'internship'); assert.equal(job.recruitmentChannel, 'campus');
    assert.equal(job.detailUrl, internshipDetailUrl(job.sourceJobId));
    assert.equal(job.sourceUrl, job.detailUrl); assert.equal(job.applyUrl, null); assert.equal(job.applicationMethod, 'unknown');
    assert.equal(job.evidence[0].sourceUrl, internshipDetailApiUrl(job.sourceJobId));
    assert.equal(job.publishedAt, null); assert.equal(job.sourceUpdatedAt, null);
    const normalized = normalizeJob(job, source);
    assert.deepEqual(normalized.reviewReasons, []);
    createPublicationPolicy([source]).assertPublishable(normalized.job);
  }
});

test('project, post ID and recruitment-type evidence rejects graduate and generic category records', async () => {
  const source = await loadTencentInternshipSource();
  const post = readInternshipPost(list.data.positionList[0])!;
  assert.equal(readInternshipPost({ postId: '-1' }), null);
  for (const id of [1200791473415778304, '0', '1e18', '-1', ' 123', '01']) assert.throws(() => internshipId(id), TencentInternshipParseError);
  for (const patch of [{ recruitType: 1 }, { projectId: 1 }, { postId: '123' }, { projectName: '校园招聘' }]) {
    assert.throws(() => readInternshipDetail({ ...ordinary, data: { ...ordinary.data, ...patch } }, post, source, observedAt));
  }
  const changed = structuredClone(mapping); changed.data[1].subProjectList[0].projectId = '1';
  assert.throws(() => readInternshipProjectMapping(changed));
  const job = readInternshipDetail(ordinary, post, source, observedAt);
  for (const patch of [{ employmentType: 'full_time' }, { recruitmentChannel: 'social' }, { detailUrl: 'https://join.qq.com/' },
    { sourceJobId: '123' }, { applyUrl: job.detailUrl, applicationMethod: 'web_form' }]) {
    assert.throws(() => normalizeJob({ ...job, ...patch }, source));
  }
});

test('text-only rich-text extraction preserves paragraphs, entities and numeric characters and rejects active or malformed markup', () => {
  assert.equal(internshipPlainText('<p>职责&nbsp;&amp;研究</p><ol><li>第一项</li><li>模型&#x1f680; &#60; 3</li></ol>'), '职责 &研究\n\n第一项\n\n模型🚀 < 3');
  assert.equal(internshipPlainText('<a title="a > b" href="javascript:alert(1)">官方文字</a>'), '官方文字');
  for (const raw of ['<script>alert(1)</script>', '<style>x</style>', '<iframe>岗位</iframe>', '<img src=x>', '<p 没有结束', '&#0;', '&#xD800;', '<!--broken']) {
    assert.throws(() => internshipPlainText(raw), TencentInternshipParseError);
  }
  assert.equal(internshipPlainText('数学 x < 3，C++ &unknown;'), '数学 x < 3，C++ &unknown;');
});

test('bounded collection stops at explicit target, retains originals and partial coverage, and can be revalidated offline', async () => {
  const source = await loadTencentInternshipSource();
  const fake = transport([listPost('1234567890123456789'), listPost('1234567890123456790'), { postId: '-1' }]);
  const capture = await collectTencentInternships({ target: 1 }, fake);
  assert.equal(capture.synthetic, true); assert.equal(capture.report.targetReached, true);
  assert.equal(capture.report.coverageComplete, false); assert.equal(capture.report.status, 'partial');
  assert.equal(capture.report.recordsSeen, 3); assert.equal(capture.report.unprocessed, 1); assert.equal(capture.report.excluded, 1);
  assert.equal(fake.calls.length, 3);
  assert.throws(() => parseTencentInternshipCapture(capture, source), error => error instanceof CaptureError && error.code === 'SYNTHETIC_CAPTURE');
  const saved = { ...capture, synthetic: false };
  const parsed = parseTencentInternshipCapture(saved, source);
  assert.equal(parsed.jobs.length, 1); assert.equal(parsed.jobs[0].visibility, 'hidden');
  const variants = [
    { ...saved, report: { ...saved.report, coverageComplete: true } },
    { ...saved, records: [saved.records[0], saved.records[0]] },
    { ...saved, records: [{ ...saved.records[0], detail: { ...ordinary, data: { ...ordinary.data, recruitType: 1 } } }] },
    { ...saved, pages: [] },
    { ...saved, source: { ...source, allowedHosts: ['evil.invalid'] } },
    { ...saved, failures: [{ sourceJobId: '99', reason: 'parse_failed' }] },
  ];
  for (const invalid of variants) assert.throws(() => parseTencentInternshipCapture(invalid, source), CaptureError);
});

test('network failures retry once, parsing failures receive no retry and valid later jobs can satisfy target', async () => {
  const source = await loadTencentInternshipSource();
  const fake = transport([listPost('1'), listPost('2'), listPost('3')], { failId: '1', invalidId: '2' });
  const capture = await collectTencentInternships({ target: 1 }, fake);
  assert.equal(fake.calls.filter(url => url.endsWith('postId=1')).length, 2);
  assert.equal(fake.calls.filter(url => url.endsWith('postId=2')).length, 1);
  assert.equal(capture.report.rejected, 2); assert.equal(capture.report.requestFailures, 1);
  assert.equal(capture.report.detailsAttempted, 3); assert.equal(capture.records.length, 1);
  assert.equal(parseTencentInternshipCapture({ ...capture, synthetic: false }, source).jobs.length, 1);
  for (const patch of [{ requestFailures: 0 }, { requestFailures: 2 }, { requestAttempts: 4 }, { requestAttempts: 11 }]) {
    assert.throws(() => parseTencentInternshipCapture({ ...capture, synthetic: false, report: { ...capture.report, ...patch } }, source), CaptureError);
  }
});

test('capture requests include mapping, lists, details and only one retry per operation', async () => {
  const source = await loadTencentInternshipSource();
  const capture = await collectTencentInternships({ target: 1 }, transport([listPost('1')]));
  assert.equal(capture.report.requestAttempts, 3);
  for (const patch of [{ requestAttempts: 0 }, { requestAttempts: 2 }, { requestAttempts: 7 }, { requestFailures: 1 }, { requestFailures: 100 }]) {
    assert.throws(() => parseTencentInternshipCapture({ ...capture, synthetic: false, report: { ...capture.report, ...patch } }, source), CaptureError);
  }
  // Successful operations can each have recovered from one network retry.
  for (const requestAttempts of [3, 6]) {
    assert.equal(parseTencentInternshipCapture({ ...capture, synthetic: false, report: { ...capture.report, requestAttempts } }, source).jobs.length, 1);
  }
});

test('terminal failed or unparseable lists retain their unsaved request in partial and failed capture accounting', async () => {
  const source = await loadTencentInternshipSource();
  for (const parsedPageCount of [0, 1]) {
    for (const terminal of ['request_failed', 'parse_failed'] as const) {
      const rows = Array.from({ length: 200 }, (_, index) => listPost(String(index + 1)));
      const fake = transport(rows);
      const post = fake.post;
      let listRequests = 0;
      fake.post = async (url, body) => {
        if (++listRequests > parsedPageCount) {
          if (terminal === 'request_failed') throw new HttpBoundaryError('HTTP_READ_TIMEOUT');
          return { status: 500, data: { count: 0, positionList: [] } };
        }
        return post(url, body);
      };
      const capture = await collectTencentInternships({ target: 200 }, fake);
      assert.equal(capture.report.stopReason, terminal);
      assert.equal(capture.report.pagesRead, parsedPageCount);
      assert.equal(capture.report.requestFailures, terminal === 'request_failed' ? 1 : 0);
      const minimumAttempts = 1 + parsedPageCount + capture.report.detailsAttempted + 1;
      assert.ok(capture.report.requestAttempts >= minimumAttempts);
      assert.equal(parseTencentInternshipCapture({ ...capture, synthetic: false }, source).jobs.length, parsedPageCount * 100);
      for (const patch of [{ requestAttempts: minimumAttempts - 1 }, { requestAttempts: minimumAttempts * 2 + 1 },
        { requestFailures: terminal === 'request_failed' ? 0 : 1 }]) {
        assert.throws(() => parseTencentInternshipCapture({ ...capture, synthetic: false, report: { ...capture.report, ...patch } }, source), CaptureError);
      }
    }
  }
});

test('six-page ceiling, mismatched totals and repeated pages retain partial accounting', async () => {
  const rows = Array.from({ length: 600 }, (_, index) => listPost(String(1000 + index)));
  const bounded = await collectTencentInternships({ target: 500 }, transport(rows, { total: 700, invalidId: '1000' }));
  assert.equal(bounded.report.targetReached, true); assert.equal(bounded.records.length, 500);
  assert.equal(bounded.report.pagesRead, 6);
  const invalid = transport(rows, { total: 700 });
  const get = invalid.get;
  invalid.get = async url => {
    const value = await get(url);
    if (url.includes('getJobDetailsByPostId')) value.data.recruitType = 1;
    return value;
  };
  const capped = await collectTencentInternships({ target: 500 }, invalid);
  assert.equal(capped.report.stopReason, 'max_pages'); assert.equal(capped.report.pagesRead, 6);
  assert.equal(capped.report.detailsAttempted, 600); assert.equal(capped.report.accepted, 0);
  const mismatched = await collectTencentInternships({ target: 1 }, transport([listPost('1')], { total: 517 }));
  assert.equal(mismatched.report.stopReason, 'total_mismatch'); assert.equal(mismatched.records.length, 0);
  const duplicate = await collectTencentInternships({ target: 2 }, transport([listPost('1'), listPost('1')]));
  assert.equal(duplicate.report.stopReason, 'repeated_page'); assert.equal(duplicate.report.duplicateIds, 1);
});

test('oversized raw metadata stops with a retained partial capture and never truncates source fields', async () => {
  const source = await loadTencentInternshipSource();
  const fake = transport(Array.from({ length: 100 }, (_, index) => listPost(String(1000 + index))));
  const get = fake.get;
  fake.get = async url => {
    const value = await get(url);
    if (url.includes('getJobDetailsByPostId')) value.data.publicMetadata = 'x'.repeat(1024 * 1024);
    return value;
  };
  const capture = await collectTencentInternships({ target: 100 }, fake);
  assert.equal(capture.report.stopReason, 'capture_limit'); assert.ok(capture.records.length > 0 && capture.records.length < 100);
  assert.equal(capture.failures.at(-1)?.reason, 'capture_limit');
  assert.ok(Buffer.byteLength(JSON.stringify(capture)) < 32 * 1024 * 1024);
  const parsed = parseTencentInternshipCapture({ ...capture, synthetic: false }, source);
  assert.equal(parsed.jobs[0].responsibilities, ordinary.data.desc);
});

test('CLI options require explicit fixed source and target or an absolute safe input file', () => {
  assert.deepEqual(readInternshipCollectionOptions(['--collect-live', '--source', 'tencent-internship', '--target', '100']), { target: 100 });
  for (const target of ['0', '501', '1e2', '-1', '1.1', '01']) {
    assert.throws(() => readInternshipCollectionOptions(['--collect-live', '--source', 'tencent-internship', '--target', target]));
  }
  assert.throws(() => readInternshipCollectionOptions(['--source', 'tencent-internship', '--target', '100']));
  const input = resolve('internship-capture.json');
  assert.deepEqual(readInternshipIngestOptions(['--source', 'tencent-internship', '--input', input]), { input });
  assert.throws(() => readInternshipIngestOptions(['--source', 'tencent-native', '--input', input]));
  const id = '00000000-0000-0000-0000-000000000001';
  assert.deepEqual(readPublishOptions(['--source', 'tencent-internship', '--ids', id]), { sourceId: 'tencent-internship', ids: [id] });
  assert.equal(JSON.parse(internshipListBody(6)).pageSize, 100); assert.throws(() => internshipListBody(7));
});
