import { ARTIFACT_PARSER_VERSIONS } from '../../contracts/artifacts.ts';

export interface DocumentLimits {
  maxBytes: number; maxPages: number; maxSheets: number; maxRows: number; maxCells: number;
  maxTextChars: number; maxZipEntries: number; maxEntryBytes: number; maxExpandedBytes: number;
  maxCompressionRatio: number; timeoutMs: number; heapMb: number; maxOutputBytes: number;
}
export const DOCUMENT_LIMITS: Readonly<DocumentLimits> = Object.freeze({
  maxBytes: 20 * 1024 * 1024, maxPages: 100, maxSheets: 20, maxRows: 20_000, maxCells: 100_000,
  maxTextChars: 2_000_000, maxZipEntries: 2_000, maxEntryBytes: 16 * 1024 * 1024,
  maxExpandedBytes: 64 * 1024 * 1024, maxCompressionRatio: 200,
  timeoutMs: 20_000, heapMb: 192, maxOutputBytes: 32 * 1024 * 1024,
});
export class DocumentError extends Error {
  readonly code: string;
  constructor(code: string) { super('Attachment processing failed.'); this.name = 'DocumentError'; this.code = code; }
}
/** Callers can lower limits for a source, never bypass the reviewed ceilings. */
export function documentLimits(input: Partial<DocumentLimits> = {}): DocumentLimits {
  if (Object.keys(input).some(key => !Object.hasOwn(DOCUMENT_LIMITS, key))) throw new DocumentError('INVALID_DOCUMENT_LIMITS');
  const limits = { ...DOCUMENT_LIMITS, ...input };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > DOCUMENT_LIMITS[key as keyof DocumentLimits]) {
      throw new DocumentError('INVALID_DOCUMENT_LIMITS');
    }
  }
  return limits;
}
export function enforceLimit(condition: boolean): void {
  if (!condition) throw new DocumentError('DOCUMENT_LIMIT_EXCEEDED');
}
export function parserVersion(kind: 'pdf' | 'xlsx'): string {
  return ARTIFACT_PARSER_VERSIONS[kind];
}
