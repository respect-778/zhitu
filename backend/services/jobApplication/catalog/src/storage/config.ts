import { RuntimeConfigError } from '../runtime/config.ts';

export type DatabasePurpose = 'read' | 'write' | 'migrate';
export interface CatalogDatabaseConfig {
  host: '127.0.0.1' | 'catalog-db';
  port: 55432 | 5432;
  database: 'knowvia_catalog_test' | 'knowvia_catalog_restore';
  user: 'catalog_reader' | 'catalog_writer' | 'catalog_migrator';
  password: string;
  ssl: false;
  application_name: 'knowvia-job-catalog';
  options: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statement_timeout: number;
  query_timeout: number;
  lock_timeout: number;
  idle_in_transaction_session_timeout: number;
  keepAlive: boolean;
}

function invalid(): never {
  throw new RuntimeConfigError('INVALID_CATALOG_DATABASE', 'Use an explicit approved local catalog database, endpoint and role without URL options.');
}

export function assertDatabaseEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (Object.keys(env).some(key => /^PG/i.test(key) || /^(DEBUG|NODE_OPTIONS|NODE_PG_FORCE_NATIVE)$/i.test(key))) {
    throw new RuntimeConfigError('AMBIENT_DATABASE_CONFIG', 'Catalog database execution requires an environment without database, debug or Node override variables.');
  }
}

/** Pure configuration boundary: no dotenv, password-file lookup, connection, or value logging. */
export function readDatabaseConfig(purpose: DatabasePurpose, env: NodeJS.ProcessEnv = process.env): CatalogDatabaseConfig {
  assertDatabaseEnvironment(env);
  if (!['read', 'write', 'migrate'].includes(purpose)) invalid();
  const raw = env.CATALOG_DATABASE_URL;
  const endpoint = env.CATALOG_DATABASE_ENDPOINT;
  if (!raw || !['local', 'container'].includes(endpoint ?? '') || /[\s\u0000-\u001f\u007f\\]/.test(raw)) invalid();
  let url: URL;
  try { url = new URL(raw); } catch { invalid(); }
  if (url.protocol !== 'postgresql:' || url.search || url.hash || !url.username || !url.password) invalid();
  const host = endpoint === 'local' ? '127.0.0.1' : 'catalog-db';
  const port = endpoint === 'local' ? 55432 : 5432;
  if (url.hostname !== host || url.port !== String(port)) invalid();
  const database = url.pathname.slice(1);
  if (!['knowvia_catalog_test', 'knowvia_catalog_restore'].includes(database)) invalid();
  const user = purpose === 'migrate' ? 'catalog_migrator' : purpose === 'write' ? 'catalog_writer' : 'catalog_reader';
  if (url.username !== user) invalid();
  let password: string;
  try { password = decodeURIComponent(url.password); } catch { invalid(); }
  if (!password || /[\u0000-\u001f\u007f]/.test(password)) invalid();
  return {
    host, port, database: database as CatalogDatabaseConfig['database'], user, password,
    ssl: false, application_name: 'knowvia-job-catalog',
    options: '-c search_path=catalog,pg_catalog', max: 4,
    connectionTimeoutMillis: 5_000, idleTimeoutMillis: 5_000,
    statement_timeout: 5_000, query_timeout: 7_000, lock_timeout: 2_000,
    idle_in_transaction_session_timeout: 10_000, keepAlive: false,
  };
}

/** The CLI is given only a reconstructed approved DSN; incoming query parameters never survive. */
export function migrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const config = readDatabaseConfig('migrate', env);
  return `postgresql://${config.user}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}?schema=catalog`;
}
