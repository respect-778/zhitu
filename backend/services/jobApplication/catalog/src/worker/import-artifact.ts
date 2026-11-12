import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { loadTrustedSources } from '../config/sources.ts';
import { assertArtifactSource, describeArtifact, recordArtifactReference, storeArtifactBytes } from '../storage/artifacts.ts';
import { assertLocalPath, assertPlainPath, readArtifactInput } from '../parsers/input.ts';
import { parseArtifact } from '../parsers/document.ts';
import { DocumentError } from '../parsers/limits.ts';
import { isInstant } from '../../contracts/validation.ts';

interface ArtifactOptions {
  mode: '--check' | '--store'; sourceId: string; sourceUrl: string; observedAt: string;
  input: string; root?: string; report?: string;
}
export function readArtifactOptions(args: string[]): ArtifactOptions {
  const [mode, ...remaining] = args;
  if (mode !== '--check' && mode !== '--store' || remaining.length % 2) throw new DocumentError('INVALID_ARTIFACT_ARGUMENTS');
  const values = new Map<string, string>();
  for (let index = 0; index < remaining.length; index += 2) {
    const key = remaining[index];
    const value = remaining[index + 1];
    if (!['--source', '--source-url', '--observed-at', '--input', '--root', '--report'].includes(key) || !value || values.has(key)) {
      throw new DocumentError('INVALID_ARTIFACT_ARGUMENTS');
    }
    values.set(key, value);
  }
  if (!['--source', '--source-url', '--observed-at', '--input'].every(key => values.has(key)) ||
      !isInstant(values.get('--observed-at')!) || (mode === '--store') !== values.has('--root')) throw new DocumentError('INVALID_ARTIFACT_ARGUMENTS');
  for (const key of ['--input', '--root', '--report']) if (values.has(key)) assertLocalPath(values.get(key)!);
  return { mode, sourceId: values.get('--source')!, sourceUrl: values.get('--source-url')!, observedAt: values.get('--observed-at')!,
    input: values.get('--input')!, root: values.get('--root'), report: values.get('--report') };
}
async function reserveReport(path: string) {
  try {
    await assertPlainPath(path, true);
    return await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch { throw new DocumentError('ARTIFACT_REPORT_REJECTED'); }
}

export async function importArtifact(options: ArtifactOptions) {
  const matches = (await loadTrustedSources()).filter(source => source.sourceId === options.sourceId);
  if (matches.length !== 1) throw new DocumentError('ARTIFACT_SOURCE_REJECTED');
  const source = assertArtifactSource(matches[0], options.sourceUrl);
  const { kind, bytes } = await readArtifactInput(options.input);
  const artifact = describeArtifact(kind, bytes);
  const parsing = await parseArtifact(kind, bytes);
  if (parsing.errorCode === 'DOCUMENT_PARSE_CANCELLED') throw new DocumentError('DOCUMENT_PARSE_CANCELLED');
  const report = { mode: 'offline-attachment', sourceId: source.sourceId, sourceUrl: options.sourceUrl, observedAt: options.observedAt,
    artifact, parsing, bytesStored: false, persisted: false, referenceId: null as string | null,
    storageErrorCode: null as string | null, reportErrorCode: null as string | null };
  // Reserve output before the first persistent mutation so an existing report cannot hide a committed import.
  const reportFile = options.report ? await reserveReport(options.report) : undefined;
  try {
    if (options.mode === '--store') {
      try {
        await storeArtifactBytes(options.root!, kind, bytes);
        report.bytesStored = true;
        // Credentials and the DB driver are used only here, after the scrubbed parser has exited.
        const { createCatalogClient } = await import('../storage/client.ts');
        const client = await createCatalogClient('write');
        try {
          const stored = await recordArtifactReference(client, artifact, source, options.sourceUrl,
            { observedAt: options.observedAt, parserVersion: parsing.parserVersion, parseState: parsing.parseState });
          report.persisted = true;
          report.referenceId = stored.referenceId;
        } finally { await client.$disconnect(); }
      } catch (error) {
        report.storageErrorCode = error instanceof DocumentError ? error.code
          : report.bytesStored ? 'ARTIFACT_DATABASE_FAILED_BYTES_RETAINED' : 'ARTIFACT_STORAGE_FAILED';
      }
    }
    if (reportFile) {
      try { await reportFile.writeFile(`${JSON.stringify(report)}\n`); await reportFile.sync(); }
      catch { report.reportErrorCode = 'ARTIFACT_REPORT_FAILED'; }
    }
    return report;
  } finally {
    await reportFile?.close().catch(() => { report.reportErrorCode = 'ARTIFACT_REPORT_FAILED'; });
  }
}

async function main() {
  const report = await importArtifact(readArtifactOptions(process.argv.slice(2)));
  const { document: _document, ...parsing } = report.parsing;
  process.stdout.write(`${JSON.stringify({ ...report, parsing })}\n`);
  if (!parsing.complete || report.storageErrorCode || report.reportErrorCode) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({ code: error instanceof DocumentError ? error.code : 'ARTIFACT_IMPORT_FAILED',
      message: 'Attachment import did not complete. Retained content-addressed bytes require reference-aware cleanup.' })}\n`);
  });
}
