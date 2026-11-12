import { assertDatabaseEnvironment, readDatabaseConfig, type DatabasePurpose } from './config.ts';
import { RuntimeConfigError } from '../runtime/config.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';

/** Validate before importing the database driver; construction does not read any other project files. */
export async function createCatalogClient(
  purpose: Exclude<DatabasePurpose, 'migrate'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrismaClient> {
  if (purpose !== 'read' && purpose !== 'write') {
    throw new RuntimeConfigError('INVALID_CATALOG_ROLE', 'Runtime database clients require an explicit read or write role.');
  }
  assertDatabaseEnvironment();
  const config = readDatabaseConfig(purpose, env);
  const [{ PrismaPg }, { PrismaClient }] = await Promise.all([
    import('@prisma/adapter-pg'), import('../generated/prisma/client.ts'),
  ]);
  const adapter = new PrismaPg(config, { schema: 'catalog' });
  return new PrismaClient({ adapter, log: [], errorFormat: 'minimal' });
}
