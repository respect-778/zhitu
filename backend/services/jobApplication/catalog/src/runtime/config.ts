import { lstatSync } from 'node:fs';
import { join } from 'node:path';

export class RuntimeConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
    this.code = code;
  }
}

export function readApiPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CATALOG_API_PORT;
  if (raw === undefined) return 5198;
  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1024 || Number(raw) > 65535) {
    throw new RuntimeConfigError('INVALID_PORT', 'CATALOG_API_PORT must be an integer from 1024 through 65535.');
  }
  return Number(raw);
}

export function readApiHost(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): '127.0.0.1' | '0.0.0.0' {
  if (env.CATALOG_API_BIND === undefined) return '127.0.0.1';
  if (env.CATALOG_API_BIND === 'container' && platform === 'linux' && env.CATALOG_DATABASE_ENDPOINT === 'container') return '0.0.0.0';
  throw new RuntimeConfigError('INVALID_API_BIND', 'Container binding requires Linux and the approved container database endpoint.');
}

export type FixtureScenario = 'normal' | 'retry-once' | 'always-fail';
export function readWorkerOptions(args: string[]): { scenario: FixtureScenario } {
  if (args.length !== 2 && args.length !== 4) {
    throw new RuntimeConfigError('INVALID_ARGUMENTS', 'Use --source fixture [--scenario normal|retry-once|always-fail].');
  }
  if (args[0] !== '--source') {
    throw new RuntimeConfigError('INVALID_ARGUMENTS', 'An explicit --source fixture is required.');
  }
  if (args[1] !== 'fixture') {
    throw new RuntimeConfigError('SOURCE_UNAVAILABLE', 'Real sources are disabled or not implemented in T04; use --source fixture.');
  }
  const scenario = args[3] ?? 'normal';
  if ((args.length === 4 && args[2] !== '--scenario') || !['normal', 'retry-once', 'always-fail'].includes(scenario)) {
    throw new RuntimeConfigError('INVALID_ARGUMENTS', 'Fixture scenario must be normal, retry-once, or always-fail.');
  }
  return { scenario: scenario as FixtureScenario };
}

/** Reject ambient Crawlee configuration before importing the library; never read or log its values. */
export function assertFixtureEnvironment(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): void {
  if (Object.keys(env).some(key => /^(CRAWLEE_|APIFY_)/i.test(key))) {
    throw new RuntimeConfigError('AMBIENT_CRAWLER_CONFIG', 'Fixture mode requires an environment without CRAWLEE_ or APIFY_ variables.');
  }
  try {
    lstatSync(join(cwd, 'crawlee.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new RuntimeConfigError('AMBIENT_CRAWLER_CONFIG', 'Cannot safely check the working directory for crawlee.json.');
  }
  throw new RuntimeConfigError('AMBIENT_CRAWLER_CONFIG', 'Fixture mode requires a working directory without crawlee.json.');
}
