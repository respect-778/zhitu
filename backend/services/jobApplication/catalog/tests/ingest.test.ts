import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JobSchema } from '../contracts/index.ts';
import { loadTencentSource } from '../src/config/sources.ts';
import { readTencentDetail, readTencentPost } from '../src/adapters/tencent.ts';
import { normalizeJob, NormalizeError } from '../src/normalize/job.ts';
import { MAX_MERGED_EVIDENCE, MergeEvidenceError, mergeJobSnapshots, sameJobContent } from '../src/storage/merge.ts';
import { ingestJobs, type JobWriter } from '../src/worker/ingest.ts';
import { ingestJob, ingestSource, observed } from './fixtures/ingest.ts';

test('normalization cleans only harmless whitespace and preserves raw values, content, source and date precision', () => {
  const original = { ...ingestJob(), title: '  产品\t 经理  ', responsibilities: ' 1.职责  一；\r\n\r\n\r\n2.材料及考试说明。 ',
    requirements: '3年工作经验；计算机相关专业；每周3天；到岗时间另行约定；\n不接受临时代投。',
    locationRaw: ' 深圳市、成都市 ', educationRaw: ' 本科及以上学历 ', salaryRaw: ' USD 100-120/天 ',
    sourceUpdatedAt: { raw: '昨天', value: null, precision: null, timezone: null } };
  const { job, reviewReasons } = normalizeJob(original, ingestSource());
  assert.equal(job.title, '产品 经理'); assert.equal(job.responsibilities, '1.职责 一；\n\n2.材料及考试说明。');
  assert.equal(job.requirements, original.requirements); assert.deepEqual(job.evidence, original.evidence);
  for (const key of ['locationRaw', 'educationRaw', 'salaryRaw', 'sourceUpdatedAt', 'sourceUrl', 'detailUrl'] as const) assert.deepEqual(job[key], original[key]);
  assert.deepEqual(job.cityCodes, ['440300', '510100']); assert.equal(job.minimumDegree, 'bachelor');
  assert.deepEqual(job.salary, { min: 100, max: 120, currency: 'USD', period: 'day' });
  assert.equal(job.publishedAt, null); assert.equal(job.deadlineAt, null); assert.equal(job.applyUrl, null);
  assert.equal(job.employmentType, 'unknown'); assert.deepEqual(reviewReasons, []);
});

test('degree, channel and employment remain independent; ambiguous qualifications and complex salaries stay unknown', () => {
  for (const [raw, expected] of [['大专及以上', 'associate'], ['学历不限', 'none'], ['本科', 'bachelor'], ['硕士及以上学历', 'master'],
    ['本科优先', undefined], ['本科或三年经验', undefined], ['大专及以上，本科优先', undefined], ['本科及以上学历（可放宽）', undefined]] as const) {
    const { job } = normalizeJob({ ...ingestJob(), educationRaw: raw, requirements: '有实习经历优先', salaryRaw: '20-30K·16薪' }, ingestSource());
    assert.equal(job.minimumDegree, expected, raw); assert.equal(job.salary, undefined); assert.equal(job.salaryRaw, '20-30K·16薪');
    assert.equal(job.employmentType, 'unknown'); assert.equal(job.recruitmentChannel, 'social');
  }
  for (const raw of ['面议', '$100元/天', '100/月', '200-100元/天']) assert.equal(normalizeJob({ ...ingestJob(), salaryRaw: raw }, ingestSource()).job.salary, undefined);
  const municipality = normalizeJob({ ...ingestJob(), locationRaw: '北京、上海、天津、重庆' }, ingestSource()).job;
  assert.deepEqual(municipality.cityCodes, ['110000', '310000', '120000', '500000']);
  assert.equal(normalizeJob({ ...ingestJob(), title: '上海产品经理', locationRaw: '杭州' }, ingestSource()).job.cityCodes?.[0], '330100');
  assert.equal(normalizeJob({ ...ingestJob(), locationRaw: '深圳或远程' }, ingestSource()).job.cityCodes, undefined);
});

test('Tencent extracts only unambiguous hard education entries, preserves complete originals and records field locator', async () => {
  const source = await loadTencentSource();
  const list = JSON.parse(await readFile(new URL('./fixtures/tencent/list.json', import.meta.url), 'utf8'));
  const detail = JSON.parse(await readFile(new URL('./fixtures/tencent/detail.json', import.meta.url), 'utf8'));
  const original = readTencentDetail(detail, readTencentPost(list.Data.Posts[0]), source, observed);
  const normalized = normalizeJob(original, source).job;
  assert.equal(normalized.minimumDegree, 'bachelor'); assert.equal(normalized.educationRaw, detail.Data.Requirement.split('\r\n')[0]);
  assert.equal(normalized.requirements, detail.Data.Requirement.replace(/\r\n/g, '\n'));
  assert.equal(normalized.evidence.at(-1)?.locator, '$.Data.Requirement;entries=1');
  for (const [requirements, expected] of [
    ['1.计算机、人工智能、自动化、应用数学、控制工程等相关专业，硕士及以上学历；\r', 'master'],
    ['1.本科及以上学历；', 'bachelor'], ['1.专科及以上学历；', 'associate'], ['1.博士学历；', 'doctorate'],
    ['1.本科及以上学历优先；', undefined], ['1.不要求本科学历；', undefined],
    ['1.本科及以上学历，可替代为工作经验；', undefined], ['1.本科或硕士学历；', undefined],
    ['1.本科及以上学历；\n2.硕士学历；', undefined], ['1.学历不限，本科优先；', undefined],
    ['1.本科及以上学历；\n2.大专且有三年经验亦可。', undefined],
    ['1.本科及以上学历；\n2.不限学历。', undefined],
    ['1.本科及以上学历；\n2.三年相关经验可替代。', undefined],
    ['1.本科及以上学历；\n2.特别优秀者可放宽。', undefined],
    ['1.本科及以上学历；\n2.或者具备五年工作经验。', undefined],
    ['1.有实习经历优先；\n2.三年运营经验。', undefined],
  ] as const) {
    const result = normalizeJob({ ...original, requirements }, source).job;
    assert.equal(result.minimumDegree, expected, requirements); assert.equal(result.employmentType, 'unknown');
  }
  const explicit = normalizeJob({ ...original, educationRaw: '大专及以上学历' }, source).job;
  assert.equal(explicit.minimumDegree, 'associate'); assert.equal(explicit.educationRaw, '大专及以上学历');
  const alternative = '1.本科及以上学历；\n2.大专且有三年经验亦可。';
  const ambiguous = normalizeJob({ ...original, requirements: alternative }, source);
  assert.equal(ambiguous.job.educationRaw, alternative); assert.equal(ambiguous.job.requirements, alternative);
  assert.ok(ambiguous.reviewReasons.includes('EDUCATION_UNCERTAIN'));
  assert.equal(ambiguous.job.evidence.at(-1)?.locator, '$.Data.Requirement;entries=1,2');
});

test('missing location, unsupported markup and garbled text are reviewable; malformed identities, unsafe origins and fake dates are rejected', () => {
  const result = normalizeJob({ ...ingestJob(), responsibilities: '  ', locationRaw: null, salaryRaw: null, educationRaw: null,
    requirements: '<script>alert(1)</script>完整条件\uFFFD' }, ingestSource());
  assert.equal(result.job.visibility, 'review'); assert.equal(result.job.requirements, '<script>alert(1)</script>完整条件\uFFFD');
  assert.deepEqual(new Set(result.reviewReasons), new Set(['MISSING_LOCATION', 'UNSUPPORTED_MARKUP', 'INVALID_TEXT_ENCODING']));
  const unknown = normalizeJob({ ...ingestJob(), employmentType: 'unknown', salaryRaw: null, publishedAt: null }, ingestSource());
  assert.equal(unknown.job.visibility, 'hidden');
  for (const input of [{ ...ingestJob(), sourceJobId: 1 }, { ...ingestJob(), sourceId: 'other' }, { ...ingestJob(), recruitmentChannel: 'campus' },
    { ...ingestJob(), sourceUrl: 'https://evil.invalid/secret' }, { ...ingestJob(), sourceUpdatedAt: { raw: '2026-02-30', value: '2026-02-30', precision: 'day', timezone: null } }]) {
    assert.throws(() => normalizeJob(input, ingestSource()), NormalizeError);
  }
  let calls = 0;
  assert.throws(() => normalizeJob({ ...ingestJob(), get title() { calls++; return 'unsafe'; } }, ingestSource()));
  assert.equal(calls, 0);
});

test('full normalization handles an in-limit 400k unterminated tag-prefix body within a bounded process', () => {
  const normalizerUrl = new URL('../src/normalize/job.ts', import.meta.url).href;
  const fixtureUrl = new URL('./fixtures/ingest.ts', import.meta.url).href;
  const script = `
    import { normalizeJob } from ${JSON.stringify(normalizerUrl)};
    import { ingestJob, ingestSource } from ${JSON.stringify(fixtureUrl)};
    const responsibilities = '<a'.repeat(200000);
    const input = { ...ingestJob(), responsibilities };
    const started = performance.now();
    const result = normalizeJob(input, ingestSource());
    process.stdout.write(JSON.stringify({ jsonCharacters: JSON.stringify(input).length,
      elapsedMs: performance.now() - started, preserved: result.job.responsibilities === responsibilities,
      markup: result.reviewReasons.includes('UNSUPPORTED_MARKUP') }));
  `;
  // A child-process timeout remains effective even when synchronous regex work blocks the event loop.
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 3_000, maxBuffer: 4_096, windowsHide: true,
  }));
  assert.ok(result.jsonCharacters < 1_000_000); assert.equal(result.preserved, true); assert.equal(result.markup, false);
  assert.ok(result.elapsedMs < 2_000);
  for (const responsibilities of ['<script>alert(1)</script>', '<a href="/jobs">完整报名说明</a>', '<input value="1<2">', '<input value=\'1<2\'>', '<!--尚未闭合注释', '<!DOCTYPE html>']) {
    const normalized = normalizeJob({ ...ingestJob(), responsibilities }, ingestSource());
    assert.equal(normalized.job.responsibilities, responsibilities); assert.ok(normalized.reviewReasons.includes('UNSUPPORTED_MARKUP'));
  }
  for (const responsibilities of ['数值条件：0<x', '比较条件：x < y；要求完整保留。']) {
    const normalized = normalizeJob({ ...ingestJob(), responsibilities }, ingestSource());
    assert.equal(normalized.job.responsibilities, responsibilities); assert.ok(!normalized.reviewReasons.includes('UNSUPPORTED_MARKUP'));
  }
});

test('salary parsing stays bounded for in-limit long whitespace, invalid ranges/suffixes and long numeric tokens', () => {
  const normalizerUrl = new URL('../src/normalize/job.ts', import.meta.url).href;
  const fixtureUrl = new URL('./fixtures/ingest.ts', import.meta.url).href;
  const script = `
    import { normalizeJob } from ${JSON.stringify(normalizerUrl)};
    import { ingestJob, ingestSource } from ${JSON.stringify(fixtureUrl)};
    const spaces = ' '.repeat(200000);
    const cases = [
      ['single', '100' + spaces + '!/月'],
      ['prefixed-single', 'CNY100' + spaces + '!/月'],
      ['range', 'CNY100' + spaces + '-' + spaces + '200!/月'],
      ['suffix', '100' + spaces + '元' + spaces + '!/月'],
      ['adjacent-numbers', 'CNY100' + spaces + '200/月'],
      ['long-integer', 'CNY' + '9'.repeat(200000) + '元/月'],
      ['long-decimal', 'CNY1.' + '0'.repeat(200000) + '!/月'],
      ['range-decimal', 'CNY1-2.' + '0'.repeat(200000) + '!元/月'],
    ];
    const results = cases.map(([name, salaryRaw]) => {
      const input = { ...ingestJob(), salaryRaw };
      const started = performance.now();
      const result = normalizeJob(input, ingestSource());
      return { name, jsonCharacters: JSON.stringify(input).length, elapsedMs: performance.now() - started,
        preserved: result.job.salaryRaw === salaryRaw, unknown: result.job.salary === undefined };
    });
    process.stdout.write(JSON.stringify(results));
  `;
  const results = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 3_000, maxBuffer: 4_096, windowsHide: true,
  }));
  for (const result of results) {
    assert.ok(result.jsonCharacters < 1_000_000, result.name); assert.ok(result.elapsedMs < 2_000, result.name);
    assert.equal(result.preserved, true, result.name); assert.equal(result.unknown, true, result.name);
  }
  for (const [salaryRaw, expected] of [
    ['CNY 100 - 200 元 /月', { min: 100, max: 200, currency: 'CNY', period: 'month' }],
    ['美元 100~120美元/天', { min: 100, max: 120, currency: 'USD', period: 'day' }],
    ['100欧元每小时', { min: 100, max: 100, currency: 'EUR', period: 'hour' }],
    ['￥0.5至1.25元/年', { min: 0.5, max: 1.25, currency: 'CNY', period: 'year' }],
  ] as const) assert.deepEqual(normalizeJob({ ...ingestJob(), salaryRaw }, ingestSource()).job.salary, expected);
});

test('merging preserves reliable missing fields and application groups; changed raw invalidates stale derivations', () => {
  const previous = normalizeJob({ ...ingestJob(), applicationMethod: 'web_form', applyUrl: 'https://fixture.invalid/apply', applicationInstructions: '提交材料',
    publishedAt: { raw: '2026-11-08', value: '2026-11-08', precision: 'day', timezone: null } }, ingestSource()).job;
  const missing = normalizeJob({ ...ingestJob(), locationRaw: null, educationRaw: null, salaryRaw: null, responsibilities: null, requirements: null }, ingestSource()).job;
  const merged = mergeJobSnapshots(previous, missing);
  for (const key of ['locationRaw', 'cityCodes', 'educationRaw', 'minimumDegree', 'salaryRaw', 'salary', 'responsibilities', 'requirements', 'applyUrl', 'applicationMethod', 'applicationInstructions', 'publishedAt'] as const) assert.deepEqual(merged[key], previous[key]);
  JobSchema.parse(merged);
  const revised = normalizeJob({ ...ingestJob(), locationRaw: '海外', educationRaw: '本科优先', salaryRaw: '面议', applicationMethod: 'offline', applicationInstructions: '现场报名' }, ingestSource()).job;
  const changed = mergeJobSnapshots(previous, revised);
  assert.equal(changed.cityCodes, undefined); assert.equal(changed.minimumDegree, undefined); assert.equal(changed.salary, undefined);
  assert.equal(changed.applyUrl, null); assert.equal(changed.applicationMethod, 'offline'); assert.equal(changed.applicationInstructions, '现场报名');
});

test('an explicit application method change replaces its instruction group; the same method can retain missing instructions', () => {
  const source = ingestSource();
  const offline = normalizeJob({ ...ingestJob(), applicationMethod: 'offline', applicationInstructions: '请到深圳现场提交纸质材料' }, source).job;
  const web = normalizeJob({ ...ingestJob(), applicationMethod: 'web_form', applyUrl: 'https://fixture.invalid/apply/new', applicationInstructions: null }, source).job;
  const changed = mergeJobSnapshots(offline, web);
  assert.equal(changed.applicationMethod, 'web_form'); assert.equal(changed.applyUrl, web.applyUrl);
  assert.equal(changed.applicationInstructions, null); JobSchema.parse(changed);
  const sameMethod = mergeJobSnapshots({ ...web, applicationInstructions: '表单中请上传PDF简历' }, web);
  assert.equal(sameMethod.applicationMethod, 'web_form'); assert.equal(sameMethod.applyUrl, web.applyUrl);
  assert.equal(sameMethod.applicationInstructions, '表单中请上传PDF简历'); JobSchema.parse(sameMethod);
});

test('retained ambiguous fields retain review while explicit corrected evidence can clear it', async () => {
  const source = ingestSource();
  let stored = normalizeJob({ ...ingestJob(), educationRaw: '本科优先' }, source).job;
  const partial = { ...ingestJob(), educationRaw: null, requirements: '三年运营经验' };
  assert.equal(normalizeJob(partial, source).job.visibility, 'hidden');
  const writer: JobWriter = async (_source, job) => {
    stored = mergeJobSnapshots(stored, job); return { id: 'review-retention', job: stored, outcome: 'updated' };
  };
  const report = await ingestJobs(source, [partial], writer);
  assert.equal(stored.educationRaw, '本科优先'); assert.equal(stored.minimumDegree, undefined);
  assert.equal(stored.visibility, 'review'); assert.equal(report.review, 1);
  assert.ok(report.rows[0].reviewReasons?.includes('EDUCATION_UNCERTAIN'));
  const corrected = await ingestJobs(source, [{ ...partial, educationRaw: '本科及以上学历' }], writer);
  assert.equal(stored.minimumDegree, 'bachelor'); assert.equal(stored.visibility, 'hidden'); assert.equal(corrected.review, 0);
});

test('identical content with later observations stays duplicate and deduplicates evidence while extending lastSeen', () => {
  const previous = normalizeJob(ingestJob(), ingestSource()).job;
  const later = { ...previous, lastSeenAt: '2026-11-09T02:00:00.000Z', lastVerifiedAt: '2026-11-09T02:00:00.000Z',
    evidence: previous.evidence.map(item => ({ ...item, observedAt: '2026-11-09T02:00:00.000Z' })) };
  const merged = mergeJobSnapshots(previous, later);
  assert.equal(sameJobContent(previous, merged), true); assert.equal(merged.lastSeenAt, later.lastSeenAt);
  assert.equal(merged.evidence.length, 1); assert.equal(merged.evidence[0].observedAt, later.lastSeenAt);
  assert.equal(sameJobContent(previous, { ...merged, title: '确实变更' }), false);
});

test('partial observations retain the original evidence time for retained fields; identical partial retries do not grow evidence', () => {
  const previous = normalizeJob({ ...ingestJob(), sourceUpdatedAt: { raw: '2026-11-09', value: '2026-11-09', precision: 'day', timezone: null } }, ingestSource()).job;
  const partial = { ...previous, title: '岗位名称明确更新', responsibilities: null, lastSeenAt: '2026-11-09T02:00:00.000Z',
    evidence: previous.evidence.map(item => ({ ...item, observedAt: '2026-11-09T02:00:00.000Z' })) };
  const merged = mergeJobSnapshots(previous, partial);
  assert.equal(merged.responsibilities, previous.responsibilities);
  assert.deepEqual(merged.evidence.map(item => item.observedAt), [previous.evidence[0].observedAt, partial.evidence[0].observedAt]);
  const retried = mergeJobSnapshots(merged, { ...partial, lastSeenAt: '2026-11-09T03:00:00.000Z',
    evidence: partial.evidence.map(item => ({ ...item, observedAt: '2026-11-09T03:00:00.000Z', locator: 'another-locator' })) });
  assert.deepEqual(retried.evidence, merged.evidence); assert.equal(retried.lastSeenAt, '2026-11-09T03:00:00.000Z');
  assert.deepEqual(retried.sourceUpdatedAt, previous.sourceUpdatedAt);
  const complete = mergeJobSnapshots(retried, { ...previous, lastSeenAt: '2026-11-09T04:00:00.000Z' });
  assert.deepEqual(complete.evidence, previous.evidence);
  const atLimit = { ...previous, evidence: Array.from({ length: MAX_MERGED_EVIDENCE }, (_, index) => ({ ...previous.evidence[0], locator: `old:${index}` })) };
  assert.throws(() => mergeJobSnapshots(atLimit, partial), MergeEvidenceError);
});

test('closed/expired repeats keep the first closedAt until an explicit open starts a new lifecycle', () => {
  const closed = { ...normalizeJob(ingestJob(), ingestSource()).job, recruitmentStatus: 'closed' as const, closedAt: observed };
  const later = '2026-11-09T02:00:00.000Z';
  const repeated = mergeJobSnapshots(closed, { ...closed, closedAt: later, lastSeenAt: later });
  assert.equal(repeated.closedAt, observed);
  const expired = mergeJobSnapshots(repeated, { ...closed, recruitmentStatus: 'expired', closedAt: later, lastSeenAt: later });
  assert.equal(expired.closedAt, observed);
  const open = mergeJobSnapshots(expired, { ...expired, recruitmentStatus: 'open', closedAt: null });
  assert.equal(open.closedAt, null);
  assert.equal(mergeJobSnapshots(open, { ...closed, closedAt: later, lastSeenAt: later }).closedAt, later);
});

test('per-item ingestion reports success, repeat identities, structural rejection and storage failure independently without leaking errors', async () => {
  const rows = new Map<string, ReturnType<typeof normalizeJob>['job']>();
  const writer: JobWriter = async (_source, job) => {
    if (job.sourceJobId === 'fail') throw new Error('SYNTHETIC_DATABASE_SECRET');
    const previous = rows.get(job.sourceJobId), merged = previous ? mergeJobSnapshots(previous, job) : job;
    rows.set(job.sourceJobId, merged);
    return { id: job.sourceJobId, job: merged, outcome: !previous ? 'inserted' : sameJobContent(previous, merged) ? 'duplicate' : 'updated' };
  };
  const values = [ingestJob(), { ...ingestJob(), sourceJobId: 2 }, ingestJob('t07-synthetic', 'fail'), { ...ingestJob('t07-synthetic', 'review'), locationRaw: null }];
  const first = await ingestJobs(ingestSource(), values, writer);
  assert.deepEqual([first.accepted, first.inserted, first.duplicates, first.review, first.rejected], [2, 2, 0, 1, 2]);
  assert.equal(first.status, 'partial'); assert.equal(first.rows[1].reason, 'INVALID_JOB'); assert.equal(first.rows[2].reason, 'DATABASE_OPERATION_FAILED');
  assert.ok(!JSON.stringify(first).includes('SYNTHETIC_DATABASE_SECRET'));
  const again = await ingestJobs(ingestSource(), values, writer);
  assert.deepEqual([again.accepted, again.inserted, again.duplicates, again.rejected], [2, 0, 2, 2]); assert.equal(rows.size, 2);
});
