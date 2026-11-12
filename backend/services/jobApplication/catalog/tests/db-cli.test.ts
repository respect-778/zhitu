import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prismaInvocation } from '../src/storage/prisma-cli.ts';
import { RuntimeConfigError } from '../src/runtime/config.ts';

test('Prisma CLI whitelist removes update/debug/proxy/runtime overrides and never forwards arbitrary flags', () => {
  const invocation = prismaInvocation(['generate'], {
    DEBUG: '*', NODE_OPTIONS: '--require malicious.cjs', NODE_PG_FORCE_NATIVE: '1',
    HTTP_PROXY: 'http://private.invalid', PRISMA_ENGINES_MIRROR: 'https://private.invalid',
    BINARY_DOWNLOAD_VERSION: 'untrusted', CATALOG_DATABASE_URL: 'secret-not-needed-for-generation',
    CHECKPOINT_DISABLE: '0', CI: '0', HOME: '/private',
  });
  assert.equal(invocation.env.CHECKPOINT_DISABLE, '1');
  assert.equal(invocation.env.CI, '1');
  assert.equal(invocation.env.PRISMA_HIDE_UPDATE_MESSAGE, '1');
  assert.equal(invocation.env.PRISMA_SCHEMA_ENGINE_BINARY, '/review-tools/schema-engine');
  assert.equal(invocation.env.HOME, '/tmp/catalog-prisma');
  for (const key of ['DEBUG', 'NODE_OPTIONS', 'NODE_PG_FORCE_NATIVE', 'HTTP_PROXY', 'PRISMA_ENGINES_MIRROR', 'BINARY_DOWNLOAD_VERSION', 'CATALOG_DATABASE_URL']) {
    assert.equal(invocation.env[key], undefined);
  }
  for (const args of [[], ['studio'], ['dev'], ['mcp'], ['migrate', 'reset'], ['generate', '--schema', '/private/schema.prisma']]) {
    assert.throws(() => prismaInvocation(args, {}), RuntimeConfigError);
  }
});

test('migration command requires the dedicated migrator and passes only approved database configuration', () => {
  const env = {
    CATALOG_DATABASE_URL: 'postgresql://catalog_migrator:synthetic-password@catalog-db:5432/knowvia_catalog_test',
    CATALOG_DATABASE_ENDPOINT: 'container', UNRELATED_SECRET: 'never-forward',
  };
  const invocation = prismaInvocation(['migrate'], env);
  assert.deepEqual(invocation.args.slice(0, 2), ['migrate', 'deploy']);
  assert.equal(invocation.env.CATALOG_DATABASE_URL, env.CATALOG_DATABASE_URL);
  assert.equal(invocation.env.UNRELATED_SECRET, undefined);
  assert.throws(() => prismaInvocation(['migrate'], { ...env, CATALOG_DATABASE_URL: env.CATALOG_DATABASE_URL.replace('catalog_migrator', 'catalog_writer') }), RuntimeConfigError);
  assert.throws(() => prismaInvocation(['status'], {}), RuntimeConfigError);
});
