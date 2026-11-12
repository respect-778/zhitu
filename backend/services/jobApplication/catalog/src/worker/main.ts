import { readWorkerOptions } from '../runtime/config.ts';
import { safeFailure } from '../runtime/errors.ts';

async function main(): Promise<void> {
  const { scenario } = readWorkerOptions(process.argv.slice(2));
  const { runFixture } = await import('./run-fixture.ts');
  const result = await runFixture(scenario);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.report.coverageComplete) process.exitCode = 1;
}

main().catch(error => {
  process.exitCode = 1;
  process.stderr.write(`${JSON.stringify(safeFailure(error))}\n`);
});
