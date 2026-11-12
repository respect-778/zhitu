import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { SourceConfig } from '../contracts/index.ts';
import { describeArtifact, recordArtifactReference } from '../src/storage/artifacts.ts';

test('dedicated DB attachment references deduplicate concurrency and retain actual observation time', {
  skip: process.env.CATALOG_DB_TEST === '1' ? false : 'Database integration requires dedicated test credentials and the T10 migration.', timeout: 60_000,
}, async t => {
  const { createCatalogClient } = await import('../src/storage/client.ts');
  const client = await createCatalogClient('write');
  const sourceId = `t10-${randomUUID()}`;
  const source: SourceConfig = { sourceId, kind: 'announcement', adapter: 't10-fixture', entryUrl: 'https://fixture.invalid/',
    allowedHosts: ['fixture.invalid'], scopeKey: 't10-fixture', recruitmentChannel: 'unknown', company: null, enabled: false };
  const artifact = describeArtifact('pdf', Buffer.from(sourceId));
  const changed = describeArtifact('pdf', Buffer.from(`${sourceId}-changed`));
  const url = 'https://fixture.invalid/attachment.pdf';
  const observation = { observedAt: '2026-11-11T01:00:00Z', parserVersion: 't10-fixture-v1', parseState: 'present' };
  t.after(async () => {
    try {
      await client.artifactReference.deleteMany({ where: { sourceId } });
      await client.artifact.deleteMany({ where: { sha256: { in: [artifact.sha256, changed.sha256] } } });
      await client.source.deleteMany({ where: { id: sourceId } });
    } finally { await client.$disconnect(); }
  });
  const outputs = await Promise.all(Array.from({ length: 8 }, () => recordArtifactReference(client, artifact, source, url, observation)));
  assert.equal(new Set(outputs.map(output => output.referenceId)).size, 1);
  assert.equal(await client.artifact.count({ where: { sha256: artifact.sha256 } }), 1);
  assert.equal(await client.artifactReference.count({ where: { sourceId } }), 1);
  await recordArtifactReference(client, artifact, source, url, { ...observation, observedAt: '2026-11-11T02:00:00Z', parserVersion: 't10-fixture-v2' });
  await recordArtifactReference(client, artifact, source, url, { ...observation, observedAt: '2026-11-11T00:00:00Z' });
  const row = await client.artifactReference.findUniqueOrThrow({ where: { id: outputs[0].referenceId } });
  assert.equal(row.observedAt.toISOString(), '2026-11-11T00:00:00.000Z');
  assert.equal(row.lastObservedAt.toISOString(), '2026-11-11T02:00:00.000Z');
  assert.equal(row.parserVersion, 't10-fixture-v2');
  await recordArtifactReference(client, changed, source, url, observation);
  assert.equal(await client.artifactReference.count({ where: { sourceId } }), 2);
  await assert.rejects(recordArtifactReference(client, artifact, { ...source, scopeKey: 'changed-scope' }, url, observation), { code: 'ARTIFACT_SOURCE_CONFLICT' });
  assert.equal(await client.artifactReference.count({ where: { sourceId } }), 2);
});
