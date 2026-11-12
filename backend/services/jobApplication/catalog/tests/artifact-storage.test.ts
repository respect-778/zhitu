import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm, mkdir, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ArtifactSchema, type SourceConfig } from '../contracts/index.ts';
import { assertArtifactSource, describeArtifact, recordArtifactReference, storeArtifactBytes } from '../src/storage/artifacts.ts';
import { readArtifactInput } from '../src/parsers/input.ts';
import { importArtifact, readArtifactOptions } from '../src/worker/import-artifact.ts';
import type { PrismaClient } from '../src/generated/prisma/client.ts';
import { textPdf } from './document-fixtures.ts';

const source: SourceConfig = { sourceId: 'fixture', kind: 'announcement', adapter: 'fixture', entryUrl: 'https://fixture.invalid/',
  allowedHosts: ['fixture.invalid'], scopeKey: 'fixture', recruitmentChannel: 'unknown', company: null, enabled: false };
const observation = { observedAt: '2026-11-11T01:00:00Z', parserVersion: 'fixture-v1', parseState: 'present' };

test('content addressed files deduplicate concurrent writes, preserve bytes and detect conflicting existing contents', async t => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = textPdf([['2027 and later']]);
  const records = await Promise.all(Array.from({ length: 8 }, () => storeArtifactBytes(root, 'pdf', bytes)));
  const artifact = records[0];
  assert.equal(new Set(records.map(record => record.storageKey)).size, 1);
  const path = join(root, ...artifact.storageKey.split('/'));
  assert.deepEqual(await readFile(path), bytes);
  assert.deepEqual(await readdir(join(root, 'sha256', artifact.sha256.slice(0, 2))), [artifact.sha256]);
  await writeFile(path, Buffer.alloc(bytes.length, 1));
  await assert.rejects(storeArtifactBytes(root, 'pdf', bytes), { code: 'ARTIFACT_STORAGE_CONFLICT' });
  assert.deepEqual(await readFile(path), Buffer.alloc(bytes.length, 1));
});

test('failed DB transaction retains CAS file and returns a fixed actionable error', async t => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = textPdf([['evidence']]);
  const artifact = await storeArtifactBytes(root, 'pdf', bytes);
  const client = { $transaction: async () => { throw new Error('private driver diagnostic'); } } as unknown as PrismaClient;
  await assert.rejects(recordArtifactReference(client, artifact, source, 'https://fixture.invalid/file.pdf', observation),
    { code: 'ARTIFACT_DATABASE_FAILED_BYTES_RETAINED' });
  assert.deepEqual(await readFile(join(root, ...artifact.storageKey.split('/'))), bytes);
});

test('attachment contracts and URLs reject forged storage keys, credentials and hosts', () => {
  const artifact = describeArtifact('pdf', Buffer.from('data'));
  assert.throws(() => ArtifactSchema.parse({ ...artifact, storageKey: '../outside' }));
  for (const url of ['http://fixture.invalid/a', 'https://other.invalid/a', 'https://user:password@fixture.invalid/a', 'https://fixture.invalid:8443/a']) {
    assert.throws(() => assertArtifactSource(source, url));
  }
  assert.equal(assertArtifactSource(source, 'https://fixture.invalid/a#page=2').sourceId, source.sourceId);
});

test('local input rejects unsupported types and symbolic links', async t => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pdf = join(root, 'input.pdf');
  await writeFile(pdf, textPdf([['input']]));
  assert.equal((await readArtifactInput(pdf)).kind, 'pdf');
  await assert.rejects(readArtifactInput(join(root, 'legacy.xls')), { code: 'UNSUPPORTED_DOCUMENT_FORMAT' });
  await assert.rejects(readArtifactInput(pdf, 1), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  await mkdir(join(root, 'real'));
  const linked = join(root, 'link');
  // Junction creation is supported without Windows symlink privileges.
  await symlink(join(root, 'real'), linked, process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(root, 'real', 'input.pdf'), Buffer.from('evidence'));
  await assert.rejects(readArtifactInput(join(linked, 'input.pdf')), { code: 'INPUT_PATH_REJECTED' });
  await assert.rejects(storeArtifactBytes(linked, 'pdf', Buffer.from('evidence')), { code: 'INPUT_PATH_REJECTED' });
});

test('normal offline CLI path returns traceable evidence with zero DB configuration or publication', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, 'input.pdf');
  const reportPath = join(root, 'report.json');
  await writeFile(input, textPdf([['2027 and later', '27 preferred']]));
  const args = ['--check', '--source', 'tencent-native', '--source-url', 'https://careers.tencent.com/attachment.pdf',
    '--observed-at', observation.observedAt, '--input', input, '--report', reportPath];
  const report = await importArtifact(readArtifactOptions(args));
  assert.equal(report.persisted, false);
  assert.equal(report.bytesStored, false);
  assert.equal(report.parsing.parseState, 'present');
  assert.equal(report.observedAt, observation.observedAt);
  assert.match(report.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report);
  const storageRoot = join(root, 'cas');
  const storeOptions = readArtifactOptions(['--store', ...args.slice(1), '--root', storageRoot]);
  await assert.rejects(importArtifact(storeOptions), { code: 'ARTIFACT_REPORT_REJECTED' });
  await assert.rejects(stat(storageRoot), { code: 'ENOENT' });
  assert.throws(() => readArtifactOptions([...args, '--source', 'tencent-native']), { code: 'INVALID_ARTIFACT_ARGUMENTS' });
  assert.throws(() => readArtifactOptions(['--store', ...args.slice(1)]), { code: 'INVALID_ARTIFACT_ARGUMENTS' });
});
