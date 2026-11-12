import { RuntimeConfigError, assertFixtureEnvironment } from '../runtime/config.ts';
import { safeFailure } from '../runtime/errors.ts';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertSafeNetworkEnvironment } from '../http/environment.ts';
export { assertSafeNetworkEnvironment } from '../http/environment.ts';
export function readTencentVerificationOptions(args: string[]) {
  if (args.length !== 9 || args[0] !== '--verify-live' || args[1] !== '--source' || args[2] !== 'tencent-native' ||
      args[3] !== '--max-pages' || args[5] !== '--page-size' || args[7] !== '--max-details' ||
      ![args[4], args[6], args[8]].every(value => /^[1-9][0-9]*$/.test(value))) {
    throw new RuntimeConfigError('INVALID_ARGUMENTS', 'Use --verify-live --source tencent-native --max-pages N --page-size N --max-details N.');
  }
  return { verifyLive: true, maxPages: Number(args[4]), pageSize: Number(args[6]), maxDetails: Number(args[8]) };
}
async function main() {
  assertSafeNetworkEnvironment();
  assertFixtureEnvironment();
  const options = readTencentVerificationOptions(process.argv.slice(2));
  const { runTencent } = await import('./run-tencent.ts');
  const result = await runTencent(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.report.coverageComplete) process.exitCode = 1;
}
// Keep option/security helpers importable without starting a request.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.exitCode = 1; process.stderr.write(`${JSON.stringify(safeFailure(error))}\n`); });
}
