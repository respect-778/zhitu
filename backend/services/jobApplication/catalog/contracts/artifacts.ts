import { array, boolean, checked, count, enumeration, ensure, identifier, instant, nonnegative, nullable, object, type Infer, type Schema } from './validation.ts';

export const ARTIFACT_PARSER_VERSIONS = { pdf: 'catalog-pdf-v1-pdfjs-6.5.438', xlsx: 'catalog-xlsx-v1-exceljs-4.4.0' } as const;

/** Field disclosure and attachment parsing are separate observations. */
export const ReadStateSchema = enumeration(['present', 'missing', 'unreachable', 'parse_failed', 'conflict']);
export type ReadState = Infer<typeof ReadStateSchema>;
export const ArtifactParseStateSchema = enumeration(['present', 'needs_ocr', 'unsupported', 'parse_failed', 'limit_exceeded']);
export type ArtifactParseState = Infer<typeof ArtifactParseStateSchema>;
export const ArtifactKindSchema = enumeration(['pdf', 'xlsx']);
export type ArtifactKind = Infer<typeof ArtifactKindSchema>;
export const ArtifactSchema = checked(object({
  sha256: identifier, kind: ArtifactKindSchema, byteSize: count, storageKey: identifier,
}), (artifact, path) => {
  ensure(/^[a-f0-9]{64}$/.test(artifact.sha256), `${path}.sha256`, 'expected a SHA256 digest');
  ensure(artifact.byteSize > 0, `${path}.byteSize`, 'expected a nonempty artifact');
  ensure(artifact.storageKey === `sha256/${artifact.sha256.slice(0, 2)}/${artifact.sha256}`,
    `${path}.storageKey`, 'storage keys must be content addressed');
});
export type Artifact = Infer<typeof ArtifactSchema>;
export const ArtifactObservationSchema = object({ observedAt: instant, parserVersion: identifier, parseState: ArtifactParseStateSchema });
export type ArtifactObservation = Infer<typeof ArtifactObservationSchema>;

export interface PdfTextItem {
  index: number; raw: string; transform: number[]; width: number; height: number; hasEOL: boolean;
}
export interface PdfLine { line: number; raw: string; itemIndices: number[]; x: number; y: number; locator: string }
export interface PdfParagraph { paragraph: number; raw: string; lineNumbers: number[]; locator: string }
export interface PdfPage {
  page: number; width: number; height: number; raw: string; items: PdfTextItem[];
  lines: PdfLine[]; paragraphs: PdfParagraph[]; parseState: 'present' | 'needs_ocr'; locator: string;
}
export interface PdfDocument { kind: 'pdf'; pages: PdfPage[] }
export type CellScalar = string | number | boolean | null;
export interface XlsxCell {
  row: number; column: number; address: string; raw: string; value: CellScalar;
  formula: string | null; cached: CellScalar; hyperlink: string | null;
  mergedMaster: string | null; mergedRange: string | null; locator: string;
}
export interface XlsxRow { row: number; empty: boolean; cells: XlsxCell[]; locator: string }
export interface XlsxSheet {
  sheet: number; name: string; rows: XlsxRow[]; merges: string[]; locator: string;
}
export interface XlsxDocument { kind: 'xlsx'; sheets: XlsxSheet[] }
export interface ArtifactParseResult {
  parserVersion: string; parseState: ArtifactParseState; complete: boolean;
  errorCode: string | null; document: PdfDocument | XlsxDocument | null;
}

const rawString: Schema<string> = { parse(input, path = '$') {
  ensure(typeof input === 'string', path, 'expected an exact string'); return input;
} };
const finiteNumber: Schema<number> = { parse(input, path = '$') {
  ensure(typeof input === 'number' && Number.isFinite(input), path, 'expected a finite number'); return input;
} };
const positiveCount = checked(count, (value, path) => ensure(value > 0, path, 'expected a positive index'));
const scalar: Schema<CellScalar> = { parse(input, path = '$') {
  ensure(input === null || typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number' && Number.isFinite(input), path, 'expected a cell scalar');
  return input;
} };
const PdfItemSchema = object({ index: count, raw: rawString,
  transform: checked(array(finiteNumber), (value, path) => ensure(value.length === 6, path, 'expected a six-value text transform')),
  width: nonnegative, height: nonnegative, hasEOL: boolean });
const PdfLineSchema = object({ line: positiveCount, raw: rawString, itemIndices: array(count), x: finiteNumber, y: finiteNumber, locator: identifier });
const PdfParagraphSchema = object({ paragraph: positiveCount, raw: rawString, lineNumbers: array(positiveCount), locator: identifier });
const PdfPageSchema = object({ page: positiveCount, width: nonnegative, height: nonnegative, raw: rawString,
  items: array(PdfItemSchema), lines: array(PdfLineSchema), paragraphs: array(PdfParagraphSchema),
  parseState: enumeration(['present', 'needs_ocr']), locator: identifier });
const PdfDocumentSchema = object({ kind: enumeration(['pdf']), pages: array(PdfPageSchema, 1) });
const XlsxCellSchema = object({ row: positiveCount, column: positiveCount, address: identifier, raw: rawString,
  value: scalar, formula: nullable(rawString), cached: scalar, hyperlink: nullable(rawString),
  mergedMaster: nullable(identifier), mergedRange: nullable(identifier), locator: identifier });
const XlsxRowSchema = object({ row: positiveCount, empty: boolean, cells: array(XlsxCellSchema), locator: identifier });
const XlsxSheetSchema = object({ sheet: positiveCount, name: rawString, rows: array(XlsxRowSchema), merges: array(identifier), locator: identifier });
const XlsxDocumentSchema = object({ kind: enumeration(['xlsx']), sheets: array(XlsxSheetSchema, 1) });
const DocumentSchema: Schema<PdfDocument | XlsxDocument> = { parse(input, path = '$') {
  ensure(input !== null && typeof input === 'object' && !Array.isArray(input), path, 'expected a parsed document');
  return Object.getOwnPropertyDescriptor(input, 'kind')?.value === 'pdf' ? PdfDocumentSchema.parse(input, path) : XlsxDocumentSchema.parse(input, path);
} };
const ParserErrorCodeSchema = enumeration([
  'INVALID_DOCUMENT_LIMITS', 'INVALID_XLSX_ARCHIVE', 'DOCUMENT_LIMIT_EXCEEDED', 'PDF_EXTERNAL_RESOURCE_REJECTED',
  'INVALID_PDF', 'UNSUPPORTED_DOCUMENT_FORMAT', 'DOCUMENT_PARSE_FAILED', 'DOCUMENT_CHILD_FAILED',
  'DOCUMENT_PARSE_TIMEOUT', 'DOCUMENT_OUTPUT_LIMIT', 'DOCUMENT_PARSE_CANCELLED', 'DOCUMENT_DEPENDENCY_REJECTED',
]);
/** Validate the untrusted child envelope before it can become evidence, persisted state or CLI output. */
export const ArtifactParseResultSchema: Schema<ArtifactParseResult> = checked(object({
  parserVersion: enumeration([ARTIFACT_PARSER_VERSIONS.pdf, ARTIFACT_PARSER_VERSIONS.xlsx]),
  parseState: ArtifactParseStateSchema, complete: boolean, errorCode: nullable(ParserErrorCodeSchema), document: nullable(DocumentSchema),
}), (result, path) => {
  const extracted = result.parseState === 'present' || result.parseState === 'needs_ocr';
  ensure(extracted === (result.document !== null), path, 'extracted results require a document and failures require none');
  ensure(extracted === (result.errorCode === null), path, 'failed results require a fixed error code');
  ensure(result.complete === (result.parseState === 'present'), path, 'only a fully extracted result is complete');
  if (result.document) {
    ensure(result.parserVersion === ARTIFACT_PARSER_VERSIONS[result.document.kind], path, 'parser version must match document kind');
    const needsOcr = result.document.kind === 'pdf' && result.document.pages.some(page => page.parseState === 'needs_ocr');
    ensure(needsOcr === (result.parseState === 'needs_ocr'), path, 'OCR state must match the extracted pages');
  }
});
