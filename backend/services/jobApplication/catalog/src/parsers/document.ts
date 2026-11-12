import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ArtifactParseResultSchema, type ArtifactKind, type ArtifactParseResult } from '../../contracts/artifacts.ts';
import { documentLimits, parserVersion, type DocumentLimits } from './limits.ts';
import { parserReadPaths } from './dependencies.ts';

export function parserEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { DISABLE_SYSTEM_FONTS_LOAD: '1' };
  // These Windows runtime values are needed by Node itself. No credentials, HOME, preload, proxy or NAPI config survives.
  for (const key of ['SystemRoot', 'WINDIR']) if (env[key]) result[key] = env[key];
  return result;
}
function failed(kind: ArtifactKind, code: string, limited = false): ArtifactParseResult {
  return { parserVersion: parserVersion(kind), parseState: limited ? 'limit_exceeded' : 'parse_failed', complete: false, errorCode: code, document: null };
}
export function parseChildResult(input: unknown, kind: ArtifactKind): ArtifactParseResult {
  const result = ArtifactParseResultSchema.parse(input);
  if (result.parserVersion !== parserVersion(kind) || result.document && result.document.kind !== kind) throw new Error('Invalid parser envelope.');
  return result;
}

/** A deadline kills and reaps the owned child. Heap/ZIP/text ceilings complement the deployment's OS memory cap. */
export function parseArtifact(kind: ArtifactKind, bytes: Buffer, requested: Partial<DocumentLimits> = {}): Promise<ArtifactParseResult> {
  const limits = documentLimits(requested);
  if (!['pdf', 'xlsx'].includes(kind)) return Promise.resolve({ ...failed(kind, 'UNSUPPORTED_DOCUMENT_FORMAT'), parseState: 'unsupported' });
  if (!bytes.length || bytes.length > limits.maxBytes) return Promise.resolve(failed(kind, 'DOCUMENT_LIMIT_EXCEEDED', true));
  let readPaths: string[];
  try { readPaths = parserReadPaths(kind); }
  catch { return Promise.resolve(failed(kind, 'DOCUMENT_DEPENDENCY_REJECTED')); }
  return new Promise(resolve => {
    const child = spawn(process.execPath, [
      '--no-addons', '--disallow-code-generation-from-strings', '--permission',
      ...readPaths.map(path => `--allow-fs-read=${path}`), `--max-old-space-size=${limits.heapMb}`,
      fileURLToPath(new URL('./child.ts', import.meta.url)), kind, JSON.stringify(limits),
    ], { env: parserEnvironment(), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let outputSize = 0;
    const chunks: Buffer[] = [];
    let failure: ArtifactParseResult | undefined;
    let settled = false;
    const stop = (result: ArtifactParseResult) => {
      failure ??= result;
      child.kill('SIGKILL');
    };
    const interrupt = () => stop(failed(kind, 'DOCUMENT_PARSE_CANCELLED'));
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    const timer = setTimeout(() => stop(failed(kind, 'DOCUMENT_PARSE_TIMEOUT', true)), limits.timeoutMs);
    const finish = (result: ArtifactParseResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
      resolve(result);
    };
    child.once('error', () => finish(failed(kind, 'DOCUMENT_CHILD_FAILED')));
    child.stdin.on('error', () => {});
    child.stdout.on('data', (value: Buffer) => {
      outputSize += value.length;
      if (outputSize > limits.maxOutputBytes) stop(failed(kind, 'DOCUMENT_OUTPUT_LIMIT', true));
      else chunks.push(value);
    });
    child.once('close', code => {
      if (failure) return finish(failure);
      if (code !== 0) return finish(failed(kind, 'DOCUMENT_CHILD_FAILED'));
      try { finish(parseChildResult(JSON.parse(Buffer.concat(chunks).toString('utf8')), kind)); }
      catch { finish(failed(kind, 'DOCUMENT_CHILD_FAILED')); }
    });
    child.stdin.end(bytes);
  });
}
