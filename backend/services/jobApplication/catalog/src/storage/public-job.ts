import type { CatalogJobSummary, Job, SourceConfig } from '../../contracts/index.ts';

/** Used both by the publication size gate and the response projection, so their fields cannot drift. */
export function publicJobSummary(id: string, job: Job, source: SourceConfig): CatalogJobSummary {
  return { id, sourceId: job.sourceId, sourceKind: source.kind,
    company: job.company, title: job.title, employmentType: job.employmentType, recruitmentChannel: job.recruitmentChannel,
    locationRaw: job.locationRaw, cityCodes: job.cityCodes ?? [], educationRaw: job.educationRaw,
    ...(job.reviewedMetadata ? { reviewedMetadata: job.reviewedMetadata } : {}),
    minimumDegree: job.minimumDegree ?? null, salaryRaw: job.salaryRaw, salary: job.salary ?? null,
    publishedAt: job.publishedAt, sourceUpdatedAt: job.sourceUpdatedAt, deadlineAt: job.deadlineAt,
    recruitmentStatus: job.recruitmentStatus, lastVerifiedAt: job.lastVerifiedAt! };
}
