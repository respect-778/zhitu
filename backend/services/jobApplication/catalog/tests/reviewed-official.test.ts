import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewedOfficialBatch, hasReviewedSnapshot } from '../src/config/reviewed-official.ts';
import { normalizeJob } from '../src/normalize/job.ts';
import { validateReviewedBatch } from '../src/worker/ingest-reviewed-official.ts';

test('reviewed official batch retains all 100 jobs, 40 employers and graduation ranges through the normal ingestion boundary', () => {
  const { jobs, batch } = validateReviewedBatch();
  assert.equal(jobs.length, 100);
  assert.equal(batch.sources.length, 40);
  assert.equal(jobs.filter(job => /20\d{2}/.test(job.reviewedMetadata!.graduateYear)).length, 24);
  assert.ok(jobs.every(job => job.employmentType === 'internship' && job.visibility === 'hidden'));
  const preferred = jobs.find(job => job.title.startsWith('机械结构实习生'))!;
  assert.equal(preferred.reviewedMetadata!.graduateYear, '2027/2028届（项目），2027届优先（岗位正文）');
  assert.match(preferred.educationRaw!, /项目要求在读/);
  assert.ok(jobs.some(job => job.detailUrl!.includes('#/job/')));
});

test('review approval cannot be reused for modified identity, qualification, URL or display metadata', () => {
  const { sources, jobs } = reviewedOfficialBatch();
  const job = jobs[0];
  const source = sources.find(item => item.sourceId === job.sourceId)!;
  for (const patch of [{ title: job.title + ' changed' }, { educationRaw: '学历不限' },
    { detailUrl: 'https://app.mokahr.com/unapproved-tenant/job' },
    { reviewedMetadata: { ...job.reviewedMetadata!, graduateYear: '2029届' } }]) {
    const changed = { ...job, ...patch };
    assert.equal(hasReviewedSnapshot(changed), false);
    assert.throws(() => normalizeJob(changed, source));
  }
  assert.throws(() => normalizeJob(job, { ...source, allowedHosts: [...source.allowedHosts, 'unapproved.invalid'] }));
  assert.throws(() => normalizeJob(job, { ...source, adapter: 'other-adapter' }));
});

test('callers cannot mutate the repository review certificate through returned objects', () => {
  const first = reviewedOfficialBatch();
  Object.assign(first.jobs[0], { title: 'changed' });
  first.sources[0].allowedHosts.push('unapproved.invalid');
  const second = reviewedOfficialBatch();
  assert.notEqual(second.jobs[0].title, 'changed');
  assert.ok(!second.sources[0].allowedHosts.includes('unapproved.invalid'));
});
