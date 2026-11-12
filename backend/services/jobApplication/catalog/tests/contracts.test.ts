import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ContractError, JobSchema, JobReferenceSchema, ListPageSchema, RunReportSchema, SourceConfigSchema,
  SourceDateSchema, type Job, type ListPage, type RunReport, type SourceConfig,
} from '../contracts/index.ts';

const source: SourceConfig = {
  sourceId: 'synthetic-careers', kind: 'enterprise', adapter: 'synthetic',
  entryUrl: 'https://careers.example.com/', allowedHosts: ['careers.example.com'],
  scopeKey: 'all-jobs:zh-cn', recruitmentChannel: 'unknown', company: '合成公司', enabled: false,
};
const timestamp = '2026-11-09T02:00:00Z';
const sourceJobId = '2093163274496552960'; // Tencent's real 19-digit shape; never convert to Number.
const detailUrl = `https://careers.example.com/jobs/${sourceJobId}`;
function job(): Job {
  return {
    sourceId: source.sourceId, sourceJobId, company: '合成公司', title: '产品实习生',
    employmentType: 'internship', recruitmentChannel: 'campus',
    responsibilities: '保留全部职责原文。', requirements: '本科及以上。', applicationInstructions: null,
    sourceUrl: detailUrl, detailUrl, applyUrl: null, applicationMethod: 'unknown',
    locationRaw: '深圳', educationRaw: '本科及以上', salaryRaw: null,
    publishedAt: null, sourceUpdatedAt: { raw: '2026年11月09日', value: '2026-11-09', precision: 'day', timezone: 'Asia/Shanghai' },
    deadlineAt: null, firstSeenAt: timestamp, lastSeenAt: timestamp, lastVerifiedAt: timestamp, closedAt: null,
    recruitmentStatus: 'open', verificationStatus: 'verified', visibility: 'published',
    evidence: [{ sourceUrl: detailUrl, observedAt: timestamp, parserVersion: 'synthetic-v1', locator: '$.Data' }],
  };
}
function page(): ListPage {
  return {
    sourceId: source.sourceId, scopeKey: source.scopeKey,
    items: [{ sourceId: source.sourceId, sourceJobId, detailUrl }],
    excluded: 0, exclusions: [],
    reportedTotal: 1, nextCursor: null, hasMore: false, completeness: 'complete', stopReason: 'exhausted',
  };
}
function run(): RunReport {
  return {
    runId: 'synthetic-run', sourceId: source.sourceId, scopeKey: source.scopeKey, status: 'complete',
    startedAt: timestamp, finishedAt: timestamp, pagesRead: 1, recordsSeen: 1, accepted: 1,
    rejected: 0, duplicateIds: 0, requestFailures: 0, reportedTotal: 1,
    excluded: 0, exclusions: [],
    nextCursor: null, hasMore: false, coverageComplete: true, stopReason: 'exhausted',
  };
}
function rejects(parse: () => unknown, path?: string) {
  assert.throws(parse, error => error instanceof ContractError && (!path || error.path === path));
}

test('one schema supplies typed, validated records without coercing IDs or replacing dates', () => {
  const parsed = JobSchema.parse(job());
  assert.equal(parsed.sourceJobId, sourceJobId);
  assert.equal(typeof parsed.sourceJobId, 'string');
  assert.equal(parsed.publishedAt, null);
  assert.equal(parsed.deadlineAt, null);
  assert.equal(parsed.sourceUpdatedAt?.value, '2026-11-09');
  assert.equal(parsed.employmentType, 'internship');
  assert.equal(parsed.recruitmentChannel, 'campus');
  assert.equal(parsed.applyUrl, null);
  assert.equal('salary' in parsed, false);
  assert.deepEqual(SourceConfigSchema.parse(source), source);
});

test('missing required fields, blank identities and numeric source IDs fail at the boundary', () => {
  const { title: _title, ...missing } = job();
  rejects(() => JobSchema.parse(missing), '$.title');
  for (const sourceJobId of [2093163274496552960, '', '   ', ' id ']) {
    rejects(() => JobSchema.parse({ ...job(), sourceJobId }), '$.sourceJobId');
  }
  rejects(() => JobSchema.parse({ ...job(), sourceId: 1 }), '$.sourceId');
  rejects(() => JobSchema.parse({ ...job(), publishedAt: undefined }), '$.publishedAt');
  rejects(() => JobSchema.parse({ ...job(), evidence: [] }), '$.evidence');
});

test('untrusted objects, raw upstream payloads and unknown properties are rejected', () => {
  for (const value of [null, [], new Date(), { Code: 200, Data: {} }, { ...job(), rawResponse: {} }]) {
    rejects(() => JobSchema.parse(value));
  }
  const accessor = Object.defineProperty({ ...job() }, 'title', { get() { throw new Error('must not execute'); } });
  rejects(() => JobSchema.parse(accessor), '$.title');
  rejects(() => JobSchema.parse(JSON.parse('{"__proto__":{"polluted":true}}')));
});

test('array validation never calls input iterators or index getters to obtain evidence', () => {
  let calls = 0;
  const iterator = Object.assign(new Array(1), { [Symbol.iterator]: function* () { calls++; } });
  const accessor = Object.defineProperty([], '0', { get() { calls++; return job().evidence[0]; }, enumerable: true });
  const iteratorAccessor = Object.defineProperty(job().evidence, Symbol.iterator, { get() { calls++; return function* () {}; } });
  for (const evidence of [iterator, accessor, iteratorAccessor]) rejects(() => JobSchema.parse({ ...job(), evidence }));
  assert.equal(calls, 0);
});

test('evidence requires dense JSON arrays and remains valid after a JSON round trip', () => {
  const hiddenIndex = Object.defineProperty(job().evidence, '0', { enumerable: false });
  const subclass = new (class extends Array<unknown> {})();
  subclass.push(job().evidence[0]);
  const customPrototype = Object.setPrototypeOf(job().evidence, Object.create(Array.prototype));
  for (const evidence of [[], new Array(1), Object.assign(job().evidence, { extra: true }), hiddenIndex, subclass, customPrototype]) {
    rejects(() => JobSchema.parse({ ...job(), evidence }));
  }
  const parsed = JobSchema.parse(job());
  assert.equal(parsed.evidence.length, 1);
  assert.deepEqual(JobSchema.parse(JSON.parse(JSON.stringify(parsed))), parsed);
});

test('employment, recruitment channel and three status axes remain separate', () => {
  for (const patch of [{ employmentType: 'campus' }, { recruitmentChannel: 'internship' },
    { recruitmentStatus: 'unreachable' }, { verificationStatus: 'open' }, { visibility: 'verified' }]) {
    rejects(() => JobSchema.parse({ ...job(), ...patch }));
  }
  const retained = JobSchema.parse({ ...job(), verificationStatus: 'unreachable' });
  assert.equal(retained.recruitmentStatus, 'open');
  assert.equal(retained.visibility, 'published');
  assert.equal(retained.lastVerifiedAt, timestamp);
  JobSchema.parse({ ...job(), recruitmentStatus: 'closed', visibility: 'hidden', closedAt: timestamp });
  for (const recruitmentStatus of ['closed', 'expired']) rejects(() => JobSchema.parse({ ...job(), recruitmentStatus }));
  rejects(() => JobSchema.parse({ ...job(), closedAt: timestamp }));
  rejects(() => JobSchema.parse({ ...job(), lastVerifiedAt: null }));
});

test('date-only precision and unparsed wording are preserved without inventing midnight', () => {
  assert.equal(SourceDateSchema.parse({ raw: '报名时间另行通知', value: null, precision: null, timezone: null }).value, null);
  SourceDateSchema.parse({ raw: '2024年2月29日', value: '2024-02-29', precision: 'day', timezone: null });
  SourceDateSchema.parse({ raw: '10:00 CST', value: '2026-11-09T10:00:00+08:00', precision: 'second', timezone: 'Asia/Shanghai' });
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', timestamp]) {
    rejects(() => SourceDateSchema.parse({ raw: value, value, precision: 'day', timezone: null }));
  }
  for (const patch of [{ value: null }, { precision: null }, { precision: 'second' }]) {
    rejects(() => SourceDateSchema.parse({ ...job().sourceUpdatedAt!, ...patch }));
  }
});

test('system times require offsets, real dates, and chronological observations', () => {
  for (const firstSeenAt of ['2026-11-09', '2026-11-09T02:00:00', '2026-02-30T02:00:00Z',
    '2026-11-09T24:00:00Z', '2026-11-09T02:00:00+14:01']) {
    rejects(() => JobSchema.parse({ ...job(), firstSeenAt }));
  }
  rejects(() => JobSchema.parse({ ...job(), lastSeenAt: '2026-11-08T02:00:00Z' }));
  JobSchema.parse({ ...job(), firstSeenAt: '2026-11-09T09:00:00+08:00' });
});

test('links retain their purpose and source instructions support non-web applications', () => {
  JobSchema.parse({ ...job(), applyUrl: 'https://careers.example.com/apply/42', applicationMethod: 'web_form' });
  JobSchema.parse({ ...job(), detailUrl: null, applicationMethod: 'email', applicationInstructions: '发送材料至 hr@example.com。' });
  for (const patch of [{ applyUrl: detailUrl }, { applicationMethod: 'web_form' },
    { applicationMethod: 'instructions' }, { detailUrl: null }, { sourceUrl: 'javascript:alert(1)' },
    { detailUrl: 'https://secret@example.com/' }, { sourceUrl: 'https:example.com' },
    { sourceUrl: 'https://example.com/\nnext' }, { applyUrl: 'mailto:hr@example.com', applicationMethod: 'web_form' }]) {
    rejects(() => JobSchema.parse({ ...job(), ...patch }));
  }
  rejects(() => SourceConfigSchema.parse({ ...source, entryUrl: 'https://other.example.com/' }));
  rejects(() => SourceConfigSchema.parse({ ...source, allowedHosts: ['*.example.com'] }));
});

test('optional normalized conditions retain raw wording and consistent salary bounds', () => {
  const salary = { min: 100, max: 200, currency: 'CNY', period: 'day' };
  JobSchema.parse({ ...job(), salaryRaw: '100-200元/天', salary, minimumDegree: 'bachelor', cityCodes: ['440300'] });
  rejects(() => JobSchema.parse({ ...job(), salary }));
  rejects(() => JobSchema.parse({ ...job(), salaryRaw: '200-100元/天', salary: { ...salary, min: 200, max: 100 } }));
  rejects(() => JobSchema.parse({ ...job(), minimumDegree: 'bachelor', educationRaw: null }));
  rejects(() => JobSchema.parse({ ...job(), cityCodes: ['440300'], locationRaw: null }));
});

test('page exhaustion and continuation are explicit, including unknown totals', () => {
  assert.deepEqual(ListPageSchema.parse(page()), page());
  ListPageSchema.parse({ ...page(), reportedTotal: null });
  ListPageSchema.parse({ ...page(), completeness: 'partial', hasMore: true, nextCursor: 'page:2', stopReason: 'more_pages' });
  ListPageSchema.parse({ ...page(), completeness: 'partial', hasMore: null, stopReason: 'unknown_end' });
  for (const patch of [{ stopReason: 'max_pages' }, { hasMore: null }, { nextCursor: 'page:2' },
    { reportedTotal: 0 }, { scopeKey: '' }, { completeness: 'partial' }]) {
    rejects(() => ListPageSchema.parse({ ...page(), ...patch }));
  }
});

test('page validation prevents mixed sources, duplicate identities and invalid counts', () => {
  rejects(() => ListPageSchema.parse({ ...page(), items: [{ ...page().items[0], sourceId: 'another-source' }] }));
  rejects(() => ListPageSchema.parse({ ...page(), items: [...page().items, ...page().items], reportedTotal: 2 }));
  rejects(() => JobReferenceSchema.parse({ ...page().items[0], sourceJobId: 2093163274496552960 }));
  for (const reportedTotal of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '1']) {
    rejects(() => ListPageSchema.parse({ ...page(), reportedTotal }));
  }
});

test('run completeness requires exhaustion, exact accounting and explainable totals', () => {
  assert.deepEqual(RunReportSchema.parse(run()), run());
  RunReportSchema.parse({ ...run(), reportedTotal: null });
  RunReportSchema.parse({ ...run(), recordsSeen: 0, accepted: 0, reportedTotal: 0 });
  for (const patch of [{ stopReason: 'max_pages' }, { reportedTotal: 2 }, { accepted: 0 },
    { accepted: 0, rejected: 1 }, { accepted: 0, duplicateIds: 1 }, { requestFailures: 1 },
    { coverageComplete: false }, { nextCursor: 'page:2', hasMore: true }, { pagesRead: 0 }]) {
    rejects(() => RunReportSchema.parse({ ...run(), ...patch }));
  }
});

test('partial, failed, cancelled and running reports cannot claim complete coverage', () => {
  RunReportSchema.parse({ ...run(), status: 'partial', coverageComplete: false, stopReason: 'max_pages', hasMore: true, nextCursor: 'page:2' });
  RunReportSchema.parse({ ...run(), status: 'failed', coverageComplete: false, stopReason: 'request_failed', requestFailures: 1 });
  RunReportSchema.parse({ ...run(), status: 'cancelled', coverageComplete: false, stopReason: 'cancelled' });
  RunReportSchema.parse({ ...run(), status: 'running', coverageComplete: false, stopReason: null, finishedAt: null, accepted: 0 });
  for (const patch of [{ status: 'partial' }, { status: 'running' }, { status: 'cancelled', coverageComplete: false },
    { finishedAt: null }, { finishedAt: '2026-11-08T02:00:00Z' }, { stopReason: null },
    { status: 'partial', coverageComplete: false, stopReason: 'more_pages' }]) {
    rejects(() => RunReportSchema.parse({ ...run(), ...patch }));
  }
});

function outsideScope(count: number) {
  return {
    reason: 'outside_scope', count, ruleId: 'tencent-native-source-id-1:v1',
    evidence: { sourceUrl: 'https://careers.example.com/query?page=1', observedAt: timestamp,
      parserVersion: 'synthetic-v1', locator: '$.Data.Posts[?(@.SourceID == 4)].SourceID' },
  };
}

test('mixed native and Workday records preserve the raw total while completing the native scope', () => {
  const exclusions = [outsideScope(1)];
  const nativePage = ListPageSchema.parse({ ...page(), scopeKey: 'tencent:native', reportedTotal: 2, excluded: 1, exclusions });
  const report = RunReportSchema.parse({ ...run(), scopeKey: nativePage.scopeKey, recordsSeen: 2,
    reportedTotal: nativePage.reportedTotal, excluded: nativePage.excluded, exclusions: nativePage.exclusions });
  assert.equal(report.accepted, 1);
  assert.equal(report.excluded, 1);
  assert.equal(report.rejected, 0);
  assert.equal(report.reportedTotal, 2);
  assert.equal(report.coverageComplete, true);
});

test('an exhausted source containing only evidenced out-of-scope records can complete an empty target scope', () => {
  const exclusions = [outsideScope(2)];
  ListPageSchema.parse({ ...page(), items: [], reportedTotal: 2, excluded: 2, exclusions });
  const report = RunReportSchema.parse({ ...run(), recordsSeen: 2, accepted: 0, reportedTotal: 2, excluded: 2, exclusions });
  assert.equal(report.accepted, 0);
  assert.equal(report.reportedTotal, 2);
});

test('exclusions cannot hide missing records, absent evidence, or a real collection failure', () => {
  const mixed = { ...run(), recordsSeen: 2, reportedTotal: 2, excluded: 1, exclusions: [outsideScope(1)] };
  for (const patch of [{ reportedTotal: 3 }, { reportedTotal: 1 }, { excluded: 0 }, { exclusions: [] },
    { exclusions: [outsideScope(0)] }, { exclusions: [{ ...outsideScope(1), ruleId: '' }] },
    { exclusions: [{ ...outsideScope(1), evidence: undefined }] },
    { exclusions: [{ ...outsideScope(1), evidence: { ...outsideScope(1).evidence, locator: undefined } }] },
    { exclusions: [{ ...outsideScope(1), reason: 'parse_failed' }] },
    { stopReason: 'max_pages' }, { requestFailures: 1 }, { accepted: 0, rejected: 1 },
    { accepted: 0, duplicateIds: 1 }, { nextCursor: 'page:2', hasMore: true }]) {
    rejects(() => RunReportSchema.parse({ ...mixed, ...patch }));
  }
  rejects(() => ListPageSchema.parse({ ...page(), reportedTotal: 2, excluded: 1, exclusions: [] }));
  rejects(() => ListPageSchema.parse({ ...page(), reportedTotal: 1, excluded: 1, exclusions: [outsideScope(1)] }));
});
