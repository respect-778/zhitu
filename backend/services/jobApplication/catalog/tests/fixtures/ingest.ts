import type { Job, SourceConfig } from '../../contracts/index.ts';

export const observed = '2026-11-09T01:00:00.000Z';
export function ingestSource(sourceId = 't07-synthetic'): SourceConfig {
  return { sourceId, kind: 'enterprise', adapter: 't07-synthetic', entryUrl: 'https://fixture.invalid/jobs',
    allowedHosts: ['fixture.invalid'], scopeKey: 'all:zh-cn', recruitmentChannel: 'social', company: '合成单位', enabled: false };
}
export function ingestJob(sourceId = 't07-synthetic', sourceJobId = '1'): Job {
  return { sourceId, sourceJobId, company: '合成单位', title: '产品经理', employmentType: 'unknown', recruitmentChannel: 'social',
    responsibilities: '1.需求调研；\n2.产品设计。', requirements: '本科及以上学历', applicationInstructions: null,
    sourceUrl: `https://fixture.invalid/jobs/${sourceJobId}`, detailUrl: `https://fixture.invalid/jobs/${sourceJobId}`,
    applyUrl: null, applicationMethod: 'unknown', locationRaw: '深圳', educationRaw: '本科及以上学历', salaryRaw: '200元/天',
    publishedAt: null, sourceUpdatedAt: null, deadlineAt: null, firstSeenAt: observed, lastSeenAt: observed,
    lastVerifiedAt: observed, closedAt: null, recruitmentStatus: 'open', verificationStatus: 'verified', visibility: 'hidden',
    evidence: [{ sourceUrl: `https://fixture.invalid/jobs/${sourceJobId}`, observedAt: observed, parserVersion: 't07-fixture-v1', locator: 'row:1' }] };
}
