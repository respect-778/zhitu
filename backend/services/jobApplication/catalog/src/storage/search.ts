import type { CatalogJobDetail, CatalogJobSummary, CatalogSearchQuery, CatalogSearchResult, CatalogSourcesResult, Job } from '../../contracts/index.ts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import { storedJob } from './jobs.ts';
import { sourceIdentity, type PublicationPolicy } from './publication-policy.ts';
import { publicJobSummary } from './public-job.ts';

export interface CatalogSearchStore {
  search(query: CatalogSearchQuery): Promise<CatalogSearchResult>;
  detail(id: string): Promise<CatalogJobDetail | null>;
  sources(): Promise<CatalogSourcesResult>;
}
export class CatalogQueryError extends Error {
  constructor() { super('CATALOG_UNAVAILABLE'); this.name = 'CatalogQueryError'; }
}

/** Prisma's contains uses LIKE: escape wildcard characters so q is always a literal substring. */
export function literalSubstring(value: string): string { return value.replace(/[\\%_]/g, '\\$&'); }

export function publicationWhere(policy: PublicationPolicy): Prisma.JobWhereInput {
  return { visibility: 'published', recruitmentStatus: { notIn: ['closed', 'expired'] },
    source: { is: { OR: policy.sources.map(sourceIdentity) } } };
}
export function searchWhere(query: CatalogSearchQuery, policy: PublicationPolicy): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = publicationWhere(policy);
  if (query.city !== undefined) where.cityCodes = { has: query.city };
  if (query.degree !== undefined) where.minimumDegree = query.degree === 'unknown' ? null : query.degree;
  if (query.employmentType !== undefined) where.employmentType = query.employmentType;
  if (query.recruitmentChannel !== undefined) where.recruitmentChannel = query.recruitmentChannel;
  if (query.sourceId !== undefined) where.sourceId = query.sourceId;
  if (query.sourceKind !== undefined) where.AND = [{ source: { is: { kind: query.sourceKind } } }];
  if (query.q !== undefined) {
    const contains = literalSubstring(query.q);
    where.OR = ['title', 'company', 'responsibilities', 'requirements'].map(field => ({ [field]: { contains, mode: 'insensitive' } }));
  }
  return where;
}
function summary(id: string, job: Job, policy: PublicationPolicy): CatalogJobSummary {
  policy.assertPublishable(job);
  return publicJobSummary(id, job, policy.source(job.sourceId));
}
function detail(id: string, job: Job, policy: PublicationPolicy): CatalogJobDetail {
  return { ...summary(id, job, policy), sourceJobId: job.sourceJobId, responsibilities: job.responsibilities,
    requirements: job.requirements, applicationInstructions: job.applicationInstructions, sourceUrl: job.sourceUrl,
    detailUrl: job.detailUrl, applyUrl: job.applyUrl, applicationMethod: job.applicationMethod };
}

/** Production wiring supplies a reader client only. Queries never import a collector or initiate collection. */
export function createCatalogSearch(client: PrismaClient, policy: PublicationPolicy): CatalogSearchStore {
  async function read<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await client.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return operation(tx);
      }, { isolationLevel: 'RepeatableRead', maxWait: 5_000, timeout: 10_000 });
    } catch { throw new CatalogQueryError(); }
  }
  return {
    search: query => read(async tx => {
      const where = searchWhere(query, policy);
      // Both statements use the same predicate and PostgreSQL repeatable-read snapshot.
      const total = await tx.job.count({ where });
      const rows = await tx.job.findMany({ where, orderBy: [{ firstSeenAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      const items = rows.map(row => { const record = storedJob(row); return summary(record.id, record.job, policy); });
      return { items, total, page: query.page, pageSize: query.pageSize };
    }),
    detail: id => read(async tx => {
      const row = await tx.job.findFirst({ where: { ...publicationWhere(policy), id } });
      if (!row) return null;
      const record = storedJob(row);
      return detail(record.id, record.job, policy);
    }),
    sources: () => read(async tx => {
      const rows = await tx.source.findMany({ where: { OR: policy.sources.map(sourceIdentity) }, select: { id: true }, orderBy: { id: 'asc' } });
      return { items: rows.map(row => {
        const source = policy.source(row.id);
        return { sourceId: source.sourceId, kind: source.kind, company: source.company, recruitmentChannel: source.recruitmentChannel };
      }) };
    }),
  };
}
