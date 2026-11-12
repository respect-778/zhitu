import { JobSchema, ListPageSchema, SourceConfigSchema } from '../../contracts/index.ts';

export function fixturePages(observedAt: string) {
  const source = SourceConfigSchema.parse({
    sourceId: 'fixture', kind: 'enterprise', adapter: 'fixture-v1',
    entryUrl: 'https://catalog.example.invalid/', allowedHosts: ['catalog.example.invalid'],
    scopeKey: 'synthetic-self-check', recruitmentChannel: 'unknown', company: '合成自检公司', enabled: true,
  });
  const pages = ['fixture-job-1', 'fixture-job-2'].map((sourceJobId, index) => {
    const url = `${source.entryUrl}jobs/${sourceJobId}`;
    const job = JobSchema.parse({
      sourceId: source.sourceId, sourceJobId, company: '合成自检公司', title: `合成岗位 ${index + 1}（非真实招聘）`,
      employmentType: 'unknown', recruitmentChannel: 'unknown', responsibilities: null, requirements: null,
      applicationInstructions: null, sourceUrl: url, detailUrl: url, applyUrl: null, applicationMethod: 'unknown',
      locationRaw: null, educationRaw: null, salaryRaw: null,
      publishedAt: null, sourceUpdatedAt: null, deadlineAt: null,
      firstSeenAt: observedAt, lastSeenAt: observedAt, lastVerifiedAt: null, closedAt: null,
      recruitmentStatus: 'unknown', verificationStatus: 'pending', visibility: 'hidden',
      evidence: [{ sourceUrl: url, observedAt, parserVersion: 'fixture-v1', locator: `synthetic[${index}]` }],
    });
    const last = index === 1;
    const page = ListPageSchema.parse({
      sourceId: source.sourceId, scopeKey: source.scopeKey,
      items: [{ sourceId: source.sourceId, sourceJobId, detailUrl: url }], excluded: 0, exclusions: [], reportedTotal: 2,
      nextCursor: last ? null : 'fixture-page-2', hasMore: !last,
      completeness: last ? 'complete' : 'partial', stopReason: last ? 'exhausted' : 'more_pages',
    });
    return { key: `fixture-page-${index + 1}`, url: `${source.entryUrl}pages/${index + 1}`, page, job };
  });
  return { source, pages };
}
