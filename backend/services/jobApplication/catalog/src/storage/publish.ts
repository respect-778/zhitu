import { SourceConfigSchema } from '../../contracts/index.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import { storedJob } from './jobs.ts';
import { PublicationError, trustedSourceMatches, validatePublicationIds, type PublicationPolicy } from './publication-policy.ts';

/** Explicit local writer operation. One source lock serializes this decision with T05/T07 source writes. */
export async function publishJobs(client: PrismaClient, policy: PublicationPolicy, sourceId: string, ids: readonly string[]) {
  validatePublicationIds(ids);
  const trusted = policy.source(sourceId);
  try {
    return await client.$transaction(async tx => {
      // Fixed SQL, bound source ID. Never accept arbitrary SQL, hosts, or paths from the CLI.
      await tx.$queryRaw`SELECT source_id FROM catalog.sources WHERE source_id = ${sourceId} FOR UPDATE`;
      const sourceRow = await tx.source.findUnique({ where: { id: sourceId } });
      if (!sourceRow) throw new PublicationError();
      const { id, createdAt: _created, updatedAt: _updated, ...fields } = sourceRow;
      const source = SourceConfigSchema.parse({ sourceId: id, ...fields });
      if (!trustedSourceMatches(source, trusted)) throw new PublicationError();
      const rows = await tx.job.findMany({ where: { sourceId, id: { in: [...ids] } }, orderBy: { id: 'asc' } });
      if (rows.length !== ids.length) throw new PublicationError();
      for (const row of rows) policy.assertPublishable(storedJob(row).job);
      const hidden = rows.filter(row => row.visibility === 'hidden').map(row => row.id);
      if (hidden.length) await tx.job.updateMany({ where: { sourceId, id: { in: hidden } }, data: { visibility: 'published' } });
      return { sourceId, requested: ids.length, published: hidden.length, alreadyPublished: ids.length - hidden.length };
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError('PUBLICATION_FAILED');
  }
}
