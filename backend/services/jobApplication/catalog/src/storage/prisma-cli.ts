import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDatabaseConfig } from './config.ts';
import { RuntimeConfigError } from '../runtime/config.ts';
import { runProcessGroup } from './process-group.ts';

const enginePath = '/review-tools/schema-engine';
const engineSha256 = '7116e00278a793ee13db6f0a732c1aaec10f795a37bc02e3a7df3b06b2f1311f';
const catalogRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const operations = {
  generate: ['generate'], validate: ['validate'], migrate: ['migrate', 'deploy'], status: ['migrate', 'status'],
} as const;
export type PrismaOperation = keyof typeof operations;

/** No user flags, inherited proxy/debug settings, or arbitrary Prisma commands reach the child. */
export function prismaInvocation(args: readonly string[], env: NodeJS.ProcessEnv): {
  operation: PrismaOperation; args: string[]; env: NodeJS.ProcessEnv;
} {
  if (args.length !== 1 || !Object.hasOwn(operations, args[0])) {
    throw new RuntimeConfigError('INVALID_PRISMA_COMMAND', 'Use exactly one reviewed operation: generate, validate, migrate, or status.');
  }
  const operation = args[0] as PrismaOperation;
  const childEnv: NodeJS.ProcessEnv = {
    PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp/catalog-prisma',
    XDG_CONFIG_HOME: '/tmp/catalog-prisma/config', XDG_CACHE_HOME: '/tmp/catalog-prisma/cache', TMPDIR: '/tmp',
    CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', CI: '1', NO_COLOR: '1',
    PRISMA_SCHEMA_ENGINE_BINARY: enginePath,
  };
  if (operation === 'migrate' || operation === 'status') {
    readDatabaseConfig('migrate', env);
    childEnv.CATALOG_DATABASE_ENDPOINT = env.CATALOG_DATABASE_ENDPOINT;
    childEnv.CATALOG_DATABASE_URL = env.CATALOG_DATABASE_URL;
  }
  return { operation, args: [...operations[operation], '--config', join(catalogRoot, 'prisma.config.ts')], env: childEnv };
}

function reviewedCliPath(): string {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new RuntimeConfigError('PRISMA_ISOLATION_REQUIRED', 'Run this command in the prepared Linux x64 catalog container with the reviewed schema engine.');
  }
  const folder = lstatSync('/review-tools');
  const engine = lstatSync(enginePath);
  if (!folder.isDirectory() || folder.isSymbolicLink() || !engine.isFile() || engine.isSymbolicLink()
      || engine.size !== 23_516_472 || createHash('sha256').update(readFileSync(enginePath)).digest('hex') !== engineSha256) {
    throw new RuntimeConfigError('PRISMA_ENGINE_NOT_REVIEWED', 'The fixed schema engine is missing or does not match the reviewed artifact.');
  }
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('prisma/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown; bin?: { prisma?: unknown } };
  if (manifest.version !== '7.10.1' || manifest.bin?.prisma !== 'build/index.js') {
    throw new RuntimeConfigError('PRISMA_VERSION_NOT_REVIEWED', 'Only the reviewed Prisma 7.10.1 CLI entrypoint is permitted.');
  }
  return join(dirname(manifestPath), 'build/index.js');
}

export async function runPrisma(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const invocation = prismaInvocation(args, env);
  const cli = reviewedCliPath();
  const result = await runProcessGroup(process.execPath, [cli, ...invocation.args], {
    cwd: catalogRoot, env: invocation.env, timeoutMs: 120_000, graceMs: 5_000,
  });
  // Third-party errors/panic diagnostics may contain request contents. Publish fixed status only.
  process.stdout.write(`${JSON.stringify({
    service: 'catalog-prisma', operation: invocation.operation,
    status: result.exitCode === 0 ? 'completed' : result.timedOut ? 'timed-out' : result.cancelled ? 'cancelled' : 'failed',
    exitCode: result.exitCode, diagnostics: 'raw-third-party-output-suppressed',
  })}\n`);
  return result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPrisma(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    process.exitCode = 1;
    const code = error instanceof RuntimeConfigError ? error.code : 'PRISMA_PREPARATION_FAILED';
    process.stderr.write(`${JSON.stringify({ code, message: 'The reviewed catalog Prisma command could not start; check the dedicated configuration and prepared container.' })}\n`);
  });
}
