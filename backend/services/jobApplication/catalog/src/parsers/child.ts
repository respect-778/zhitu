import type { ArtifactKind, ArtifactParseResult } from '../../contracts/artifacts.ts';
import { DocumentError, documentLimits, parserVersion } from './limits.ts';

// Dependency warnings can contain document strings or local paths. Only the final fixed envelope leaves this child.
console.log = console.warn = console.error = () => {};
const kind = process.argv[2] as ArtifactKind;
const limits = documentLimits(JSON.parse(process.argv[3] ?? '{}'));
let bytes = 0;
const chunks: Buffer[] = [];
const output = (result: ArtifactParseResult) => process.stdout.write(JSON.stringify(result));
try {
  if (!['pdf', 'xlsx'].includes(kind)) throw new DocumentError('UNSUPPORTED_DOCUMENT_FORMAT');
  for await (const value of process.stdin) {
    const chunk = value as Buffer;
    bytes += chunk.length;
    if (bytes > limits.maxBytes) throw new DocumentError('DOCUMENT_LIMIT_EXCEEDED');
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  const document = kind === 'pdf'
    ? await (await import('./pdf.ts')).parsePdf(input, limits)
    : await (await import('./xlsx.ts')).parseXlsx(input, limits);
  const parseState = document.kind === 'pdf' && document.pages.some(page => page.parseState === 'needs_ocr') ? 'needs_ocr' : 'present';
  output({ parserVersion: parserVersion(kind), parseState, complete: parseState === 'present', errorCode: null, document });
} catch (error) {
  const limited = error instanceof DocumentError && error.code === 'DOCUMENT_LIMIT_EXCEEDED';
  output({ parserVersion: parserVersion(kind), parseState: limited ? 'limit_exceeded' : 'parse_failed', complete: false,
    errorCode: error instanceof DocumentError ? error.code : 'DOCUMENT_PARSE_FAILED', document: null });
}
