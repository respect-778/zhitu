import { JobSchema, SourceConfigSchema, type Job, type SourceConfig } from '../../contracts/index.ts';
import { Prisma, type Job as JobRow, type PrismaClient } from '../generated/prisma/client.ts';
import { MergeEvidenceError, mergeJobSnapshots, sameJobContent } from './merge.ts';

export class CatalogStorageError extends Error {
  readonly code: 'SOURCE_IDENTITY_MISMATCH' | 'DATABASE_OPERATION_FAILED';
  constructor(code: CatalogStorageError['code']) {
    super(code === 'SOURCE_IDENTITY_MISMATCH'
      ? 'The stored source identity or scope does not match this input.'
      : 'The catalog database operation failed.');
    this.name = 'CatalogStorageError';
    this.code = code;
  }
}
export interface StoredJob { id: string; job: Job }
export interface MergedStoredJob extends StoredJob { outcome: 'inserted' | 'updated' | 'duplicate' }

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : json(value);
}
function sourceData(source: SourceConfig) {
  const { sourceId, ...fields } = source;
  return { id: sourceId, ...fields };
}
function jobData(job: Job) {
  return {
    sourceId: job.sourceId, sourceJobId: job.sourceJobId, company: job.company, title: job.title,
    employmentType: job.employmentType, recruitmentChannel: job.recruitmentChannel,
    responsibilities: job.responsibilities, requirements: job.requirements,
    applicationInstructions: job.applicationInstructions, sourceUrl: job.sourceUrl,
    detailUrl: job.detailUrl, applyUrl: job.applyUrl, applicationMethod: job.applicationMethod,
    locationRaw: job.locationRaw, cityCodes: job.cityCodes ?? [],
    educationRaw: job.educationRaw, minimumDegree: job.minimumDegree ?? null,
    reviewedMetadata: nullableJson(job.reviewedMetadata),
    salaryRaw: job.salaryRaw, salary: nullableJson(job.salary),
    publishedAt: nullableJson(job.publishedAt), sourceUpdatedAt: nullableJson(job.sourceUpdatedAt),
    deadlineAt: nullableJson(job.deadlineAt),
    firstSeenAt: new Date(job.firstSeenAt), lastSeenAt: new Date(job.lastSeenAt),
    lastVerifiedAt: job.lastVerifiedAt === null ? null : new Date(job.lastVerifiedAt),
    closedAt: job.closedAt === null ? null : new Date(job.closedAt),
    recruitmentStatus: job.recruitmentStatus, verificationStatus: job.verificationStatus,
    visibility: job.visibility, evidence: json(job.evidence),
  };
}

/** Read through the same contract so corrupted or incompatible stored data cannot silently escape. */
export function storedJob(row: JobRow): StoredJob {
  const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = row;
  return {
    id,
    job: JobSchema.parse({
      ...fields,
      cityCodes: fields.cityCodes.length ? fields.cityCodes : undefined,
      minimumDegree: fields.minimumDegree ?? undefined,
      salary: fields.salary ?? undefined,
      reviewedMetadata: fields.reviewedMetadata ?? undefined,
      firstSeenAt: fields.firstSeenAt.toISOString(), lastSeenAt: fields.lastSeenAt.toISOString(),
      lastVerifiedAt: fields.lastVerifiedAt?.toISOString() ?? null,
      closedAt: fields.closedAt?.toISOString() ?? null,
    }),
  };
}

/** Existing T05 complete-snapshot API; callers intentionally replace a full snapshot. */
export async function upsertJob(client: PrismaClient, sourceInput: unknown, jobInput: unknown): Promise<StoredJob> {
  const { outcome: _outcome, ...stored } = await writeJob(client, sourceInput, jobInput, false);
  return stored;
}

/** Partial observations are merged with the current row under the same source lock, never read outside it. */
export async function mergeUpsertJob(client: PrismaClient, sourceInput: unknown, jobInput: unknown): Promise<MergedStoredJob> {
  return writeJob(client, sourceInput, jobInput, true);
}

async function writeJob(client: PrismaClient, sourceInput: unknown, jobInput: unknown, merge: boolean): Promise<MergedStoredJob> {
  const source = SourceConfigSchema.parse(sourceInput);
  const job = JobSchema.parse(jobInput);
  if (source.sourceId !== job.sourceId) throw new CatalogStorageError('SOURCE_IDENTITY_MISMATCH');
  try {
    return await client.$transaction(async tx => {
      // Updating the identical ID takes a row lock: concurrent writes for a source serialize.
      const existingSource = await tx.source.upsert({
        where: { id: source.sourceId }, create: sourceData(source), update: { id: source.sourceId },
      });
      if (existingSource.scopeKey !== source.scopeKey || existingSource.adapter !== source.adapter || existingSource.kind !== source.kind) {
        throw new CatalogStorageError('SOURCE_IDENTITY_MISMATCH');
      }
      const identity = { sourceId: job.sourceId, sourceJobId: job.sourceJobId };
      const existing = await tx.job.findUnique({ where: { sourceId_sourceJobId: identity } });
      const firstSeenAt = new Date(Math.min(Date.parse(job.firstSeenAt), existing?.firstSeenAt.getTime() ?? Infinity));
      // Late retries still contribute the earliest observation, but cannot replace newer content.
      if (existing && existing.lastSeenAt.getTime() > Date.parse(job.lastSeenAt)) {
        const row = firstSeenAt < existing.firstSeenAt
          ? await tx.job.update({ where: { id: existing.id }, data: { firstSeenAt } })
          : existing;
        return { ...storedJob(row), outcome: 'duplicate' };
      }
      await tx.source.update({ where: { id: source.sourceId }, data: sourceData(source) });
      const previous = existing ? storedJob(existing).job : null;
      const observed = JobSchema.parse({ ...job, reviewedMetadata: job.reviewedMetadata ?? previous?.reviewedMetadata });
      const next = merge && previous ? mergeJobSnapshots(previous, observed) : observed;
      const outcome = previous === null ? 'inserted' : sameJobContent(previous, next) ? 'duplicate' : 'updated';
      const data = jobData(JobSchema.parse(next));
      data.firstSeenAt = firstSeenAt;
      const row = await tx.job.upsert({ where: { sourceId_sourceJobId: identity }, create: data, update: data });
      return { ...storedJob(row), outcome };
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof CatalogStorageError || error instanceof MergeEvidenceError) throw error;
    throw new CatalogStorageError('DATABASE_OPERATION_FAILED');
  }
}
