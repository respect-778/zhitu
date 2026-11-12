import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ArtifactSchema, ArtifactObservationSchema, SourceConfigSchema, type Artifact, type ArtifactKind } from '../../contracts/index.ts';
import { httpUrl } from '../../contracts/validation.ts';
import { assertPlainPath, assertLocalPath } from '../parsers/input.ts';
import { DOCUMENT_LIMITS, DocumentError } from '../parsers/limits.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';

export function describeArtifact(kind: ArtifactKind, bytes: Buffer): Artifact {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length > DOCUMENT_LIMITS.maxBytes) throw new DocumentError('DOCUMENT_LIMIT_EXCEEDED');
  return ArtifactSchema.parse({ sha256, kind, byteSize: bytes.length, storageKey: `sha256/${sha256.slice(0, 2)}/${sha256}` });
}
export function assertArtifactSource(sourceInput: unknown, sourceUrl: string) {
  const source = SourceConfigSchema.parse(sourceInput);
  httpUrl.parse(sourceUrl);
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || !source.allowedHosts.includes(url.hostname)) {
    throw new DocumentError('ARTIFACT_SOURCE_REJECTED');
  }
  return source;
}
async function verifyExisting(path: string, artifact: Artifact): Promise<void> {
  await assertPlainPath(path);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size !== artifact.byteSize) throw new DocumentError('ARTIFACT_STORAGE_CONFLICT');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(Math.min(64 * 1024, info.size));
    let position = 0;
    while (position < info.size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, info.size - position), position);
      if (!bytesRead) throw new DocumentError('ARTIFACT_STORAGE_CONFLICT');
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    if (hash.digest('hex') !== artifact.sha256) throw new DocumentError('ARTIFACT_STORAGE_CONFLICT');
  } finally { await file.close(); }
}

/** Publish a complete CAS file without overwrite. A failed concurrent importer never removes another importer's file. */
export async function storeArtifactBytes(root: string, kind: ArtifactKind, bytes: Buffer): Promise<Artifact> {
  assertLocalPath(root);
  const artifact = describeArtifact(kind, bytes);
  await assertPlainPath(root, true);
  const directory = join(root, 'sha256', artifact.sha256.slice(0, 2));
  await assertPlainPath(directory, true);
  await mkdir(directory, { recursive: true });
  await assertPlainPath(directory);
  const target = join(root, ...artifact.storageKey.split('/'));
  const temporary = join(directory, `artifact-${randomUUID()}.tmp`);
  let created = false;
  try {
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    try { await link(temporary, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await verifyExisting(target, artifact);
    }
    return artifact;
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError('ARTIFACT_STORAGE_FAILED');
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
}

/** The CAS write precedes this transaction. Any DB failure leaves its bytes for later reference-aware T17 cleanup. */
export async function recordArtifactReference(client: PrismaClient, artifactInput: unknown, sourceInput: unknown, sourceUrl: string, observationInput: unknown) {
  const artifact = ArtifactSchema.parse(artifactInput);
  const source = assertArtifactSource(sourceInput, sourceUrl);
  const observation = ArtifactObservationSchema.parse(observationInput);
  try {
    return await client.$transaction(async tx => {
      const { sourceId, ...fields } = source;
      const storedSource = await tx.source.upsert({ where: { id: sourceId }, create: { id: sourceId, ...fields }, update: { id: sourceId } });
      if (storedSource.scopeKey !== source.scopeKey || storedSource.adapter !== source.adapter || storedSource.kind !== source.kind) {
        throw new DocumentError('ARTIFACT_SOURCE_CONFLICT');
      }
      const stored = await tx.artifact.upsert({ where: { sha256: artifact.sha256 }, create: artifact, update: { sha256: artifact.sha256 } });
      if (stored.storageKey !== artifact.storageKey || stored.kind !== artifact.kind || stored.byteSize !== artifact.byteSize) {
        throw new DocumentError('ARTIFACT_STORAGE_CONFLICT');
      }
      const identity = { artifactSha256: artifact.sha256, sourceId, sourceUrl };
      const previous = await tx.artifactReference.findUnique({ where: { artifactSha256_sourceId_sourceUrl: identity } });
      const observed = new Date(observation.observedAt);
      const data = { ...identity, observedAt: new Date(Math.min(observed.getTime(), previous?.observedAt.getTime() ?? Infinity)),
        lastObservedAt: new Date(Math.max(observed.getTime(), previous?.lastObservedAt.getTime() ?? 0)),
        parserVersion: observation.parserVersion, parseState: observation.parseState };
      const stale = previous && previous.lastObservedAt > observed;
      const row = await tx.artifactReference.upsert({ where: { artifactSha256_sourceId_sourceUrl: identity }, create: data,
        update: stale ? { observedAt: data.observedAt } : data });
      return { artifact, referenceId: row.id };
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError('ARTIFACT_DATABASE_FAILED_BYTES_RETAINED');
  }
}
