import { isCatalogJobId, JobSchema, SourceConfigSchema, type Job, type SourceConfig } from '../../contracts/index.ts';
import { assertSourceUrls, jobReviewReasons } from '../normalize/job.ts';
import { publicJobSummary } from './public-job.ts';

export const MAX_PUBLIC_JOB_BYTES = 128 * 1024;
export const MAX_PUBLIC_SUMMARY_BYTES = 8 * 1024;

export class PublicationError extends Error {
  readonly code: 'PUBLICATION_REJECTED' | 'PUBLICATION_FAILED';
  constructor(code: PublicationError['code'] = 'PUBLICATION_REJECTED') {
    super(code); this.name = 'PublicationError'; this.code = code;
  }
}

export function validatePublicationIds(ids: readonly string[]): void {
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => !isCatalogJobId(id))) throw new PublicationError();
}

/** Enabled controls collection, not trust. All remaining source fields must match the repository policy. */
export function sourceIdentity(source: SourceConfig) {
  return { id: source.sourceId, kind: source.kind, adapter: source.adapter, entryUrl: source.entryUrl,
    allowedHosts: { equals: [...source.allowedHosts] }, scopeKey: source.scopeKey,
    recruitmentChannel: source.recruitmentChannel, company: source.company };
}

export function trustedSourceMatches(stored: SourceConfig, trusted: SourceConfig): boolean {
  return JSON.stringify(sourceIdentity(stored)) === JSON.stringify(sourceIdentity(trusted));
}

/** Production callers supply only loadTrustedSources(); synthetic sources are explicitly injected by tests. */
export function createPublicationPolicy(inputs: readonly SourceConfig[]) {
  const sources = inputs.map(input => SourceConfigSchema.parse(input));
  if (!sources.length || new Set(sources.map(source => source.sourceId)).size !== sources.length) throw new PublicationError();
  const byId = new Map(sources.map(source => [source.sourceId, source]));
  return {
    sources,
    source(sourceId: string): SourceConfig {
      const source = byId.get(sourceId);
      if (!source) throw new PublicationError();
      return source;
    },
    assertPublishable(input: Job): Job {
      try {
        const job = JobSchema.parse(input);
        const source = byId.get(job.sourceId);
        if (!source || job.visibility === 'review' || job.verificationStatus !== 'verified' || job.lastVerifiedAt === null ||
            ['closed', 'expired'].includes(job.recruitmentStatus) || job.closedAt !== null ||
            (source.company !== null && source.company !== job.company) ||
            (source.recruitmentChannel !== 'unknown' && source.recruitmentChannel !== job.recruitmentChannel) ||
            job.sourceJobId.length > 128 || jobReviewReasons(job).length ||
            (job.detailUrl === null && job.applicationInstructions === null)) throw new PublicationError();
        if ([...job.title].length > 200 || [...job.company].length > 120 ||
            // Measure the final state on both write and read; 'published' is longer than 'hidden'.
            Buffer.byteLength(JSON.stringify({ ...job, visibility: 'published' }), 'utf8') > MAX_PUBLIC_JOB_BYTES ||
            Buffer.byteLength(JSON.stringify(publicJobSummary('00000000-0000-0000-0000-000000000000', job, source)), 'utf8') > MAX_PUBLIC_SUMMARY_BYTES) {
          throw new PublicationError();
        }
        assertSourceUrls(job, source);
        return job;
      } catch { throw new PublicationError(); }
    },
  };
}
export type PublicationPolicy = ReturnType<typeof createPublicationPolicy>;
