import { defineConfig } from 'prisma/config';
import { migrationDatabaseUrl } from './src/storage/config.ts';

// Generation/validation do not need a database. Any provided URL is checked even for those commands.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: process.env.CATALOG_DATABASE_URL === undefined ? undefined : { url: migrationDatabaseUrl() },
});
