import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { JobSchema, RunReportSchema, SourceConfigSchema } from '../contracts/index.ts';
import { createApi } from '../src/api/server.ts';
import { assertFixtureEnvironment, readApiPort, readWorkerOptions, RuntimeConfigError } from '../src/runtime/config.ts';
import { safeFailure } from '../src/runtime/errors.ts';
import { runFixture } from '../src/worker/run-fixture.ts';

test('API health is only liveness; legacy and readiness endpoints remain unavailable', async () => {
  const api = createApi();
  try {
    const response = await api.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      service: 'job-catalog-api', check: 'liveness', status: 'alive', ready: false,
      capabilities: { database: 'not-configured', collection: 'separate-worker', query: 'implemented' },
    });
    for (const url of ['/ready', '/jobs', '/sources']) {
      assert.equal((await api.inject({ method: 'GET', url })).statusCode, 404);
    }
  } finally { await api.close(); }
});

test('a local API releases its port and reports a conflicting listener without exposing raw errors', async () => {
  const api = createApi();
  const conflicting = createApi();
  const replacement = createApi();
  try {
    await api.listen({ host: '127.0.0.1', port: 0 });
    const address = api.server.address();
    assert.ok(address && typeof address !== 'string');
    assert.equal(address.address, '127.0.0.1');
    await assert.rejects(conflicting.listen({ host: '127.0.0.1', port: address.port }), error => {
      assert.equal(safeFailure(error).code, 'EADDRINUSE');
      return true;
    });
    await api.close();
    await replacement.listen({ host: '127.0.0.1', port: address.port });
    assert.equal((await replacement.inject('/health')).statusCode, 200);
  } finally {
    await Promise.all([api.close(), conflicting.close(), replacement.close()]);
  }
});

test('invalid ports and unavailable sources fail explicitly without echoing input values', () => {
  assert.equal(readApiPort({}), 5198);
  assert.equal(readApiPort({ CATALOG_API_PORT: '5218' }), 5218);
  for (const value of ['', '0', '-1', '1023', '65536', '1.5', '1e4', ' 5198 ', 'private-token']) {
    assert.throws(() => readApiPort({ CATALOG_API_PORT: value }), error => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(safeFailure(error).code, 'INVALID_PORT');
      assert.ok(!JSON.stringify(safeFailure(error)).includes('private-token'));
      return true;
    });
  }
  for (const args of [[], ['--source', 'tencent'], ['--source', 'fixture', '--url', 'https://example.com'], ['--source', 'fixture', '--scenario', 'unknown']]) {
    assert.throws(() => readWorkerOptions(args), RuntimeConfigError);
  }
  assert.deepEqual(readWorkerOptions(['--source', 'fixture']), { scenario: 'normal' });
  assert.deepEqual(safeFailure(new Error('private-token')), {
    code: 'RUNTIME_FAILED', message: 'Catalog execution failed. No successful collection or persistence is claimed.',
  });
});

test('ambient crawler variables and configuration files are rejected without reading their contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-ambient-test-'));
  try {
    assertFixtureEnvironment({}, directory);
    for (const key of ['CRAWLEE_STORAGE_DIR', 'CRAWLEE_PURGE_ON_START', 'APIFY_TOKEN', 'crawlee_persist_storage']) {
      assert.throws(() => assertFixtureEnvironment({ [key]: 'private-token' }, directory), error => {
        assert.ok(error instanceof RuntimeConfigError);
        assert.equal(error.code, 'AMBIENT_CRAWLER_CONFIG');
        assert.ok(!error.message.includes('private-token'));
        return true;
      });
    }
    await writeFile(join(directory, 'crawlee.json'), 'not JSON; private-token');
    assert.throws(() => assertFixtureEnvironment({}, directory), RuntimeConfigError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Crawlee processes exactly two synthetic pages, validates shared contracts, and recovers one retry', async () => {
  for (const scenario of ['normal', 'retry-once'] as const) {
    const result = await runFixture(scenario);
    assert.equal(result.mode, 'fixture');
    assert.equal(result.synthetic, true);
    assert.equal(result.persisted, false);
    SourceConfigSchema.parse(result.source);
    const report = RunReportSchema.parse(result.report);
    assert.equal(report.status, 'complete');
    assert.equal(report.coverageComplete, true);
    assert.equal(report.pagesRead, 2);
    assert.equal(report.accepted, 2);
    assert.equal(report.requestFailures, 0);
    assert.deepEqual(result.attempts, { 'fixture-page-1': 1, 'fixture-page-2': scenario === 'normal' ? 1 : 2 });
    for (const job of result.jobs) {
      JobSchema.parse(job);
      assert.equal(job.sourceId, 'fixture');
      assert.equal(job.visibility, 'hidden');
      assert.equal(job.verificationStatus, 'pending');
      assert.equal(job.lastVerifiedAt, null);
    }
  }
});

test('exhausted fixture retries preserve the observed partial result and cannot claim full coverage', async () => {
  const result = await runFixture('always-fail');
  const report = RunReportSchema.parse(result.report);
  assert.equal(report.status, 'partial');
  assert.equal(report.coverageComplete, false);
  assert.equal(report.stopReason, 'request_failed');
  assert.equal(report.requestFailures, 1);
  assert.equal(report.accepted, 1);
  assert.equal(report.recordsSeen, 1);
  assert.equal(report.reportedTotal, 2);
  assert.equal(report.hasMore, true);
  assert.equal(report.nextCursor, 'fixture-page-2');
  assert.deepEqual(result.attempts, { 'fixture-page-1': 1, 'fixture-page-2': 2 });
});
