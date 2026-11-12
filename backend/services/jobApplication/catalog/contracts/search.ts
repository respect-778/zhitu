import type { Job, SourceConfig } from './records.ts';

export const isCatalogJobId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

/** Public DTOs deliberately omit evidence, parser metadata, and source backend configuration. */
export interface CatalogSource {
  sourceId: string;
  kind: SourceConfig['kind'];
  company: string | null;
  recruitmentChannel: Job['recruitmentChannel'];
}
export interface CatalogJobSummary {
  id: string;
  sourceId: string;
  sourceKind: SourceConfig['kind'];
  company: string;
  title: string;
  employmentType: Job['employmentType'];
  recruitmentChannel: Job['recruitmentChannel'];
  locationRaw: string | null;
  cityCodes: string[];
  educationRaw: string | null;
  reviewedMetadata?: NonNullable<Job['reviewedMetadata']>;
  minimumDegree: NonNullable<Job['minimumDegree']> | null;
  salaryRaw: string | null;
  salary: NonNullable<Job['salary']> | null;
  publishedAt: Job['publishedAt'];
  sourceUpdatedAt: Job['sourceUpdatedAt'];
  deadlineAt: Job['deadlineAt'];
  recruitmentStatus: Job['recruitmentStatus'];
  lastVerifiedAt: string;
}
export interface CatalogJobDetail extends CatalogJobSummary {
  sourceJobId: string;
  responsibilities: string | null;
  requirements: string | null;
  applicationInstructions: string | null;
  sourceUrl: string;
  detailUrl: string | null;
  applyUrl: string | null;
  applicationMethod: Job['applicationMethod'];
}
export interface CatalogSearchQuery {
  q?: string;
  city?: string;
  degree?: NonNullable<Job['minimumDegree']> | 'unknown';
  employmentType?: Job['employmentType'];
  recruitmentChannel?: Job['recruitmentChannel'];
  sourceKind?: SourceConfig['kind'];
  sourceId?: string;
  page: number;
  pageSize: number;
}
export interface CatalogSearchResult {
  items: CatalogJobSummary[];
  total: number;
  page: number;
  pageSize: number;
}
export interface CatalogSourcesResult { items: CatalogSource[] }
export type CatalogErrorCode = 'INVALID_REQUEST' | 'JOB_NOT_FOUND' | 'ROUTE_NOT_FOUND' | 'CATALOG_UNAVAILABLE';
export interface CatalogErrorResponse { error: { code: CatalogErrorCode; message: string } }
