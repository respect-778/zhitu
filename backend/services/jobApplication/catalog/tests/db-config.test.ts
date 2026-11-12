import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrationDatabaseUrl, readDatabaseConfig } from '../src/storage/config.ts';
import { RuntimeConfigError } from '../src/runtime/config.ts';

const example = 'postgresql://catalog_writer:synthetic-password@127.0.0.1:55432/knowvia_catalog_test';
const local = { CATALOG_DATABASE_ENDPOINT: 'local', CATALOG_DATABASE_URL: example };

test('database configuration requires the dedicated endpoint, database and role with no ambient PG configuration', () => {
  const config = readDatabaseConfig('write', local);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 55432);
  assert.equal(config.database, 'knowvia_catalog_test');
  assert.equal(config.user, 'catalog_writer');
  assert.equal(config.ssl, false);
  assert.ok(config.connectionTimeoutMillis > 0 && config.statement_timeout > 0 && config.max <= 4);
  assert.ok(!('connectionString' in config));
  const container = readDatabaseConfig('read', {
    CATALOG_DATABASE_ENDPOINT: 'container',
    CATALOG_DATABASE_URL: 'postgresql://catalog_reader:synthetic-password@catalog-db:5432/knowvia_catalog_restore',
  });
  assert.equal(container.database, 'knowvia_catalog_restore');
  assert.equal(container.host, 'catalog-db');
});

test('database boundary rejects remote/server-default/socket databases, certificates and arbitrary URL options without echoing secrets', () => {
  const denied = [
    undefined, '', 'not-a-url', example.replace('postgresql:', 'postgres:'),
    example.replace('127.0.0.1', 'localhost'), example.replace('127.0.0.1', '10.0.0.1'),
    example.replace('127.0.0.1', 'catalog-db'), example.replace(':55432', ':5432'),
    example.replace('knowvia_catalog_test', 'postgres'), example.replace('knowvia_catalog_test', 'knownai'),
    example.replace('catalog_writer', 'postgres'), example.replace(':synthetic-password', ''),
    example.replace('synthetic-password', '%00'), `${example}?sslmode=disable`,
    `${example}?sslcert=C%3A%2Fsecret.pem`, `${example}?host=/var/run/postgresql`,
    `${example}?schema=public`, `${example}#ignored`, `${example} `,
  ];
  for (const raw of denied) {
    assert.throws(() => readDatabaseConfig('write', { ...local, CATALOG_DATABASE_URL: raw }), error => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(error.code, 'INVALID_CATALOG_DATABASE');
      assert.ok(!error.message.includes('synthetic-password'));
      assert.ok(!error.message.includes('secret.pem'));
      return true;
    });
  }
});

test('migration role and fixed migration namespace cannot be supplied by an untrusted URL query', () => {
  assert.throws(() => readDatabaseConfig('migrate', local), RuntimeConfigError);
  assert.throws(() => readDatabaseConfig('read', local), RuntimeConfigError);
  assert.throws(() => readDatabaseConfig('untrusted' as 'read', { ...local, CATALOG_DATABASE_URL: example.replace('catalog_writer', 'catalog_reader') }), RuntimeConfigError);
  const env = { ...local, CATALOG_DATABASE_URL: example.replace('catalog_writer', 'catalog_migrator') };
  assert.equal(new URL(migrationDatabaseUrl(env)).search, '?schema=catalog');
  assert.throws(() => migrationDatabaseUrl({ ...env, CATALOG_DATABASE_URL: `${env.CATALOG_DATABASE_URL}?schema=public` }), RuntimeConfigError);
});

test('ambient PG variables, incomplete endpoint mode and malformed password escapes fail before importing the driver', () => {
  for (const name of ['PGHOST', 'PGPASSWORD', 'PGPASSFILE', 'PGOPTIONS', 'pgsslrootcert', 'DEBUG', 'NODE_PG_FORCE_NATIVE', 'NODE_OPTIONS']) {
    assert.throws(() => readDatabaseConfig('write', { ...local, [name]: 'do-not-read-or-log' }), error => {
      assert.ok(error instanceof RuntimeConfigError && error.code === 'AMBIENT_DATABASE_CONFIG');
      assert.ok(!error.message.includes('do-not-read-or-log'));
      return true;
    });
  }
  assert.throws(() => readDatabaseConfig('write', { CATALOG_DATABASE_URL: example }), RuntimeConfigError);
  assert.throws(() => readDatabaseConfig('write', { ...local, CATALOG_DATABASE_URL: example.replace('synthetic-password', '%not-hex') }), RuntimeConfigError);
});
