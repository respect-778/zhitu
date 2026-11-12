import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildTencentMetadataCapture, metadataProvenance, projectMetadataRecord, readMetadataCapture, readMetadataJob } from '../src/adapters/internship-metadata.ts';
import { internshipProfiles, metadataSourceIds } from '../src/config/internship-profiles.ts';
import { loadMetadataSource, loadTencentInternshipSource, loadTrustedSources } from '../src/config/sources.ts';
import { normalizeJob } from '../src/normalize/job.ts';
import { createPublicationPolicy } from '../src/storage/publication-policy.ts';
import { readPublishOptions } from '../src/storage/publish-cli.ts';
import { collectInternshipMetadata, metadataListRequest, readMetadataCollectionOptions, readMetadataList } from '../src/worker/collect-internship-metadata.ts';
import { readMetadataIngestOptions } from '../src/worker/ingest-internship-metadata.ts';

const samples = JSON.parse(await readFile(new URL('./fixtures/internship-metadata.json', import.meta.url), 'utf8'));
const observedAt = '2026-11-09T12:50:00.000Z';
const capture = (sourceId: string, records: unknown[]) => ({ mode: 'internship-metadata-v1', synthetic: false, persisted: false,
  sourceId, observedAt, provenance: metadataProvenance(sourceId), records });

test('fixed public list metadata produces nullable-body publishable jobs with official source-specific links and dates', async () => {
  for (const [sourceId, records] of Object.entries(samples)) {
    const source = await loadMetadataSource(sourceId);
    const policy = createPublicationPolicy([source]);
    const parsed = readMetadataCapture(capture(sourceId, records as unknown[]), source);
    assert.ok(parsed.jobs.length > 0);
    for (const job of parsed.jobs) {
      assert.equal(job.responsibilities, null); assert.equal(job.requirements, null); assert.equal(job.applicationInstructions, null);
      assert.equal(job.employmentType, 'internship'); assert.equal(job.recruitmentChannel, 'campus');
      assert.equal(job.applyUrl, null); assert.equal(job.applicationMethod, 'unknown');
      assert.equal(job.sourceUrl, job.detailUrl);
      const normalized = normalizeJob(job, source);
      assert.deepEqual(normalized.reviewReasons, []); assert.equal(normalized.job.visibility, 'hidden');
      policy.assertPublishable(normalized.job);
    }
  }
  const cicc = readMetadataJob(await loadMetadataSource('cicc-internship'), samples['cicc-internship'][0], observedAt);
  assert.equal(cicc.deadlineAt, null); assert.equal(cicc.salaryRaw, '面议'); assert.equal(cicc.publishedAt?.value, null);
  assert.equal(cicc.publishedAt?.raw, samples['cicc-internship'][0].PostDate);
  const nvidia = readMetadataJob(await loadMetadataSource('nvidia-china-internship'), samples['nvidia-china-internship'][1], observedAt);
  assert.equal(nvidia.locationRaw, '3 Locations（Shanghai）'); assert.equal(nvidia.publishedAt?.value, null);
});

test('source type, country, tenant, stable ID and official URL binding reject unsupported or substituted rows', async () => {
  const xiaomi = await loadMetadataSource('xiaomi-internship');
  const xm = samples['xiaomi-internship'][0];
  for (const patch of [{ type: 1 }, { jobPostId: Number(xm.jobPostId) }, { cityZhNames: ['新加坡'] },
    { url: xm.url.replace(xm.jobPostId, '123') }, { url: xm.url.replace('xiaomi.jobs', 'other.jobs') }]) {
    assert.throws(() => readMetadataJob(xiaomi, { ...xm, ...patch }, observedAt));
  }
  assert.ok(readMetadataJob(xiaomi, { ...xm, cityZhNames: ['北京', '新加坡'] }, observedAt));
  const cicc = await loadMetadataSource('cicc-internship');
  for (const patch of [{ CategoryId: '1' }, { Kind: '正式' }, { Status: 0 }, { LocNames: ['新加坡共和国'] }, { Id: 'invalid' }]) {
    assert.throws(() => readMetadataJob(cicc, { ...samples['cicc-internship'][0], ...patch }, observedAt));
  }
  const nv = await loadMetadataSource('nvidia-china-internship');
  for (const patch of [{ externalPath: samples[nv.sourceId][0].externalPath.replace('China-Shanghai', 'United-States') },
    { locationsText: 'United States' }, { bulletFields: ['JR1'] }]) {
    assert.throws(() => readMetadataJob(nv, { ...samples[nv.sourceId][0], ...patch }, observedAt));
  }
  const roche = await loadMetadataSource('roche-china-internship');
  assert.throws(() => readMetadataJob(roche, { ...samples[roche.sourceId][0], title: 'Permanent specialist' }, observedAt));
});

test('classification provenance, synthetic data, duplicate identities and unsupported sources fail before ingestion', async () => {
  const source = await loadMetadataSource('nvidia-china-internship');
  const valid = capture(source.sourceId, samples[source.sourceId]);
  for (const patch of [{ synthetic: true }, { persisted: true }, { sourceId: 'other' }, { unexpected: true },
    { provenance: { ...valid.provenance, sourceUrl: 'https://other.invalid/jobs' } },
    { provenance: { ...valid.provenance, classification: { ...valid.provenance.classification, workerSubType: 'regular' } } },
    { records: [samples[source.sourceId][0], samples[source.sourceId][0]] }]) {
    assert.throws(() => readMetadataCapture({ ...valid, ...patch }, source));
  }
  await assert.rejects(loadMetadataSource('unreviewed-source'));
  const trusted = await loadTrustedSources();
  const existingIds = ['tencent-native', 'tencent-internship', ...metadataSourceIds];
  assert.deepEqual(trusted.slice(0, existingIds.length).map(source => source.sourceId), existingIds);
  const reviewed = trusted.slice(existingIds.length);
  assert.equal(reviewed.length, 40);
  assert.ok(reviewed.every(source => source.adapter === 'reviewed-official' && /^official-[a-f0-9]{16}$/.test(source.sourceId)));
  assert.equal(new Set(trusted.map(source => source.sourceId)).size, trusted.length);
  for (const profile of internshipProfiles) assert.equal((await loadMetadataSource(profile.sourceId)).enabled, false);
});

test('source URL publication checks reject a valid-looking path for another job and keep the remaining review rules', async () => {
  for (const sourceId of Object.keys(samples)) {
    const source = await loadMetadataSource(sourceId), policy = createPublicationPolicy([source]);
    const job = normalizeJob(readMetadataJob(source, samples[sourceId][0], observedAt), source).job;
    for (const patch of [{ detailUrl: source.entryUrl }, { sourceJobId: '1' }, { locationRaw: null },
      { verificationStatus: 'pending' }, { recruitmentStatus: 'closed' }, { company: 'another-company' },
      { title: '<script>bad</script>' }, { requirements: 'broken\uFFFD' }]) {
      assert.throws(() => policy.assertPublishable({ ...job, ...patch } as typeof job));
    }
  }
});

test('metadata projection discards all full bodies before capture storage', () => {
  const raw = { ...samples['cicc-internship'][0], Duty: 'FULL_DUTY', Requirement: 'FULL_REQUIREMENT', applicationInstructions: 'FULL_APPLICATION' };
  const projected = projectMetadataRecord('cicc-internship', raw);
  for (const body of ['FULL_DUTY', 'FULL_REQUIREMENT', 'FULL_APPLICATION']) assert.ok(!JSON.stringify(projected).includes(body));
});

test('nested degree descriptors retain only metadata scalars across projection and returned captures', async () => {
  const degree = { id: 'bachelor', name: '本科', description: 'LEAKED_DUTIES', nested: { requirements: 'LEAKED_REQUIREMENTS' } };
  const xpeng = await loadMetadataSource('xpeng-internship');
  const xpengRow = { id: '1234567890123456789', title: '合成实习生',
    recruit_type: { id: '202', name: '实习', description: 'LEAKED_RECRUITMENT_BODY' },
    city_list: [{ name: '广州', duties: 'LEAKED_CITY_BODY' }], job_post_info: { required_degree: degree, description: 'LEAKED_POST_BODY' } };
  const cicc = await loadMetadataSource('cicc-internship');
  const ciccRow = { ...samples[cicc.sourceId][0], Degree: degree };
  for (const [source, row] of [[xpeng, xpengRow], [cicc, ciccRow]] as const) {
    const projected = projectMetadataRecord(source.sourceId, row);
    assert.ok(!JSON.stringify(projected).includes('LEAKED_'));
    const parsed = readMetadataCapture(capture(source.sourceId, [row]), source);
    assert.ok(!JSON.stringify(parsed.capture).includes('LEAKED_'));
    const normalized = normalizeJob(parsed.jobs[0], source).job;
    assert.equal(normalized.educationRaw, '本科'); assert.equal(normalized.minimumDegree, 'bachelor');
    createPublicationPolicy([source]).assertPublishable(normalized);
  }
});

test('fixed API collector uses only list queries, filters overseas metadata and stops at an explicit bounded target', async () => {
  const row = samples['xiaomi-internship'][0];
  const calls: string[] = [];
  const fake = {
    async get(url: string) { calls.push(url); return { code: 0, data: { total: 2, list: [{ ...row, cityZhNames: ['华沙'] }, row] } }; },
    async post(): Promise<unknown> { throw new Error('UNEXPECTED_POST'); },
  };
  const collected = await collectInternshipMetadata({ sourceId: 'xiaomi-internship', target: 1 }, fake);
  assert.equal(collected.report?.accepted, 1); assert.equal(collected.report?.excluded, 1);
  assert.equal(collected.report?.targetReached, true); assert.equal(collected.report?.coverageComplete, false);
  assert.equal(calls.length, 1); assert.ok(calls[0].includes('type=3')); assert.ok(!JSON.stringify(collected).includes('Requirement'));
  const source = await loadMetadataSource('xiaomi-internship');
  assert.throws(() => readMetadataCapture(collected, source));
  assert.equal(readMetadataCapture({ ...collected, synthetic: false }, source).jobs.length, 1);
  for (const sourceId of ['cicc-internship', 'nvidia-china-internship', 'roche-china-internship']) {
    const request = metadataListRequest(sourceId, 2), body = JSON.parse(request.body!);
    assert.ok(request.url.startsWith('https://')); assert.ok(request.body);
    if (sourceId === 'cicc-internship') assert.equal(body.PageIndex, 1);
    else assert.equal(body.offset, 20);
  }
  assert.throws(() => metadataListRequest('nvidia-china-internship', 51));
  assert.throws(() => metadataListRequest('xiaomi-internship', 11));
  assert.throws(() => readMetadataList('cicc-internship', { Code: 200, Count: 0, Data: Array(101).fill({}) }, 100));
});

test('overlapping metadata pages keep deduplicating and continue while new source IDs remain', async () => {
  const sample = samples['xiaomi-internship'][0];
  const row = (index: number) => {
    const id = String(1000000000000000000n + BigInt(index));
    return { ...sample, jobPostId: id, url: sample.url.replace(sample.jobPostId, id) };
  };
  const pages = [Array.from({ length: 100 }, (_, index) => row(index)),
    Array.from({ length: 100 }, (_, index) => row(index + 82)), Array.from({ length: 100 }, (_, index) => row(index + 182))];
  const collected = await collectInternshipMetadata({ sourceId: 'xiaomi-internship', target: 250 }, {
    async get(url) { return { code: 0, data: { total: 608, list: pages[Number(new URL(url).searchParams.get('pageNum')) - 1] } }; },
    async post() { throw new Error('UNEXPECTED_POST'); },
  });
  assert.equal(collected.report?.accepted, 250); assert.equal(collected.report?.pagesRead, 3);
  assert.equal(collected.report?.duplicateIds, 18); assert.equal(collected.report?.stopReason, 'target_reached');
  assert.equal(collected.report?.reportedTotal, 608); assert.equal(collected.report?.coverageComplete, false);
  assert.equal(new Set(collected.records.map(row => (row as { jobPostId: string }).jobPostId)).size, 250);

  // A new overseas page is source progress even when it contributes no domestic jobs.
  const domestic = Array.from({ length: 300 }, (_, index) => row(index));
  const withOverseasPage = await collectInternshipMetadata({ sourceId: 'xiaomi-internship', target: 101 }, {
    async get(url) {
      const page = Number(new URL(url).searchParams.get('pageNum'));
      const list = domestic.slice((page - 1) * 100, page * 100).map(row => page === 2 ? { ...row, cityZhNames: ['华沙'] } : row);
      return { code: 0, data: { total: 300, list } };
    },
    async post() { throw new Error('UNEXPECTED_POST'); },
  });
  assert.equal(withOverseasPage.report?.accepted, 101); assert.equal(withOverseasPage.report?.pagesRead, 3);
  assert.equal(withOverseasPage.report?.excluded, 100);
});

test('repeated whole metadata pages or reordered pages without new source IDs stop within the page budget', async () => {
  const sample = samples['xiaomi-internship'][0];
  const rows = Array.from({ length: 100 }, (_, index) => {
    const id = String(1000000000000000000n + BigInt(index));
    return { ...sample, jobPostId: id, url: sample.url.replace(sample.jobPostId, id) };
  });
  for (const reordered of [false, true]) {
    const collected = await collectInternshipMetadata({ sourceId: 'xiaomi-internship', target: 200 }, {
      async get(url) {
        const page = Number(new URL(url).searchParams.get('pageNum'));
        return { code: 0, data: { total: 608, list: page > 1 && reordered ? [...rows].reverse() : rows } };
      },
      async post() { throw new Error('UNEXPECTED_POST'); },
    });
    assert.equal(collected.report?.accepted, 100); assert.equal(collected.report?.duplicateIds, 100);
    assert.equal(collected.report?.pagesRead, 2); assert.equal(collected.report?.stopReason, 'repeated_page');
  }
});

test('Workday populated continuation pages can omit total while first totals and final page sizes stay authoritative', async () => {
  const sample = samples['nvidia-china-internship'][0];
  const rows = Array.from({ length: 89 }, (_, index) => ({ ...sample, bulletFields: [`JR${2000000 + index}`],
    externalPath: sample.externalPath.replace(/_JR[0-9]+(?:-[0-9]+)?$/, `_JR${2000000 + index}`) }));
  const offsets: number[] = [];
  const collected = await collectInternshipMetadata({ sourceId: 'nvidia-china-internship', target: 89 }, {
    async get() { throw new Error('UNEXPECTED_GET'); },
    async post(_url, body) {
      const query = JSON.parse(body); offsets.push(query.offset);
      return { total: query.offset === 0 ? 89 : 0, jobPostings: rows.slice(query.offset, query.offset + query.limit) };
    },
  });
  assert.deepEqual(offsets, [0, 20, 40, 60, 80]);
  assert.equal(collected.report?.accepted, 89); assert.equal(collected.report?.pagesRead, 5);
  assert.equal(collected.report?.reportedTotal, 89); assert.equal(collected.report?.stopReason, 'target_reached');
  assert.equal(collected.report?.coverageComplete, false);
  for (const invalid of ['initial_zero', 'changed_nonzero', 'short_final_page'] as const) {
    const bad = await collectInternshipMetadata({ sourceId: 'nvidia-china-internship', target: 89 }, {
      async get() { throw new Error('UNEXPECTED_GET'); },
      async post(_url, body) {
        const query = JSON.parse(body);
        const total = invalid === 'initial_zero' ? 0 : query.offset === 0 ? 89 : invalid === 'changed_nonzero' ? 90 : 0;
        const page = rows.slice(query.offset, query.offset + query.limit);
        return { total, jobPostings: invalid === 'short_final_page' && query.offset === 80 ? page.slice(0, 8) : page };
      },
    });
    assert.equal(bad.report?.stopReason, 'total_mismatch'); assert.equal(bad.report?.targetReached, false);
  }
});

test('saved Tencent list metadata can include previously unhydrated jobs with list-only verification evidence', async () => {
  const source = await loadTencentInternshipSource();
  const mapping = JSON.parse(await readFile(new URL('./fixtures/tencent-internship/project-mapping.json', import.meta.url), 'utf8'));
  const list = JSON.parse(await readFile(new URL('./fixtures/tencent-internship/list.json', import.meta.url), 'utf8'));
  const minimal = buildTencentMetadataCapture({ mode: 'tencent-internship', synthetic: false, source, projectMapping: mapping,
    report: { finishedAt: observedAt }, pages: [{ response: list }], records: [] });
  const parsed = readMetadataCapture(minimal, source), policy = createPublicationPolicy([source]);
  assert.equal(parsed.jobs.length, 2);
  for (const job of parsed.jobs) {
    assert.equal(job.requirements, null); assert.equal(job.evidence[0].sourceUrl, 'https://join.qq.com/api/v1/position/searchPosition');
    policy.assertPublishable(normalizeJob(job, source).job);
  }
  assert.deepEqual(normalizeJob(parsed.jobs[0], source).job.cityCodes, ['440300', '110000', '310000', '440100', '510100', '330100']);
});

test('browser metadata requires explicit internship descriptors and canonical tenant-bound links', async () => {
  const xpeng = await loadMetadataSource('xpeng-internship');
  const row = { id: '1234567890123456789', title: '合成实习生', recruit_type: { id: '202', name: '实习' }, city_list: [{ name: '广州' }] };
  const job = readMetadataJob(xpeng, row, observedAt);
  createPublicationPolicy([xpeng]).assertPublishable(normalizeJob(job, xpeng).job);
  assert.throws(() => readMetadataJob(xpeng, { ...row, recruit_type: { id: '201', name: '正式' } }, observedAt));
  const known = readMetadataJob(xpeng, { ...row, publish_time: 1778586427289,
    job_post_info: { required_degree: { name: '本科' }, min_salary: 300, max_salary: 500, currency: 'CNY', expiry_time: 1798761600000 } }, observedAt);
  assert.deepEqual(known.publishedAt, { raw: '1778586427289', value: '2026-05-12T11:47:07Z', precision: 'second', timezone: 'UTC' });
  assert.equal(known.educationRaw, '本科'); assert.equal(known.salaryRaw, '{"min_salary":300,"max_salary":500,"currency":"CNY"}');
  assert.equal(known.deadlineAt?.raw, '1798761600000');
  assert.equal(normalizeJob(known, xpeng).job.minimumDegree, 'bachelor'); assert.equal(normalizeJob(known, xpeng).job.salary, undefined);
  assert.throws(() => readMetadataJob(xpeng, { ...row, publish_time: 1778586427289.5 }, observedAt));
  const bosch = await loadMetadataSource('bosch-internship');
  const id = 'e6ff06b8-e662-40a1-b43e-ea2310b690a1';
  const listSourceUrl = 'https://app.mokahr.com/campus-recruitment/bosch/67942?locale=zh-CN';
  const boschRow = { id, title: '合成实习生', commitment: '实习', location: '苏州', listSourceUrl, detailUrl: `${listSourceUrl}#/job/${id}` };
  const batch = capture('bosch-internship', [boschRow]); batch.provenance.sourceUrl = listSourceUrl;
  const parsed = readMetadataCapture(batch, bosch);
  createPublicationPolicy([bosch]).assertPublishable(normalizeJob(parsed.jobs[0], bosch).job);
  assert.ok(readMetadataJob(bosch, { ...boschRow, listSourceUrl: `${listSourceUrl}#/jobs` }, observedAt));
  for (const patch of [{ commitment: '全职' }, { location: 'Singapore' }, { detailUrl: boschRow.detailUrl.replace('/bosch/', '/other/') }]) {
    assert.throws(() => readMetadataJob(bosch, { ...boschRow, ...patch }, observedAt));
  }
});

test('metadata and publish CLIs accept fixed sources and bounded explicit flags', () => {
  assert.deepEqual(readMetadataCollectionOptions(['--collect-live', '--source', 'xiaomi-internship', '--target', '400']), { sourceId: 'xiaomi-internship', target: 400 });
  for (const target of ['0', '401', '1e2', '-1']) assert.throws(() => readMetadataCollectionOptions(['--collect-live', '--source', 'xiaomi-internship', '--target', target]));
  assert.throws(() => readMetadataCollectionOptions(['--collect-live', '--source', 'xpeng-internship', '--target', '10']));
  const input = resolve('metadata.json');
  assert.deepEqual(readMetadataIngestOptions(['--source', 'bosch-internship', '--input', input]), { sourceId: 'bosch-internship', input });
  assert.throws(() => readMetadataIngestOptions(['--source', 'other', '--input', input]));
  const id = '00000000-0000-0000-0000-000000000001';
  assert.deepEqual(readPublishOptions(['--source', 'cicc-internship', '--ids', id]), { sourceId: 'cicc-internship', ids: [id] });
});
