import { inflateRawSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { SaxesParser } from 'saxes';
import { DocumentError, enforceLimit, type DocumentLimits } from './limits.ts';

const require = createRequire(import.meta.url);
interface DecodedRange { top?: number; bottom?: number; left?: number; right?: number; row?: number; col?: number }
const columnCache = require('exceljs/lib/utils/col-cache.js') as { decodeEx(value: string): DecodedRange };
const DefinedNameXform = require('exceljs/lib/xlsx/xform/book/defined-name-xform.js') as new () => {
  parseOpen(node: { name: string; attributes: Record<string, string> }): void;
  parseText(value: string): void; parseClose(): void; model: { ranges: string[] };
};
interface XmlTag { name: string; attributes: Record<string, string> }
const spreadsheetNamespaces = new Set([
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://purl.oclc.org/ooxml/spreadsheetml/main',
]);

function invalidArchive(): never { throw new DocumentError('INVALID_XLSX_ARCHIVE'); }
function inspectExtra(bytes: Buffer, start: number, size: number): void {
  const end = start + size;
  if (end > bytes.length) invalidArchive();
  let offset = start;
  while (offset < end) {
    if (offset + 4 > end || [1, 0x7075].includes(bytes.readUInt16LE(offset))) invalidArchive();
    offset += 4 + bytes.readUInt16LE(offset + 2);
  }
  if (offset !== end) invalidArchive();
}

/** Inspect and actually bounded-inflate every ZIP entry before ExcelJS's eager JSZip.loadAsync path. */
export function inspectXlsxZip(bytes: Buffer, limits: DocumentLimits): void {
  const invalid = () => { throw new DocumentError('INVALID_XLSX_ARCHIVE'); };
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      end = offset; break;
    }
  }
  if (end < 0) invalid();
  const entryCount = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryOffset = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== entryCount ||
      entryCount === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff ||
      directoryOffset + directorySize !== end) invalid();
  enforceLimit(entryCount <= limits.maxZipEntries);
  let offset = directoryOffset;
  let expanded = 0;
  let worksheetCount = 0;
  let worksheetCells = 0;
  let worksheetRows = 0;
  const names = new Set<string>();
  const ranges: [number, number][] = [];
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) invalid();
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const expandedSize = bytes.readUInt32LE(offset + 24);
    const nameSize = bytes.readUInt16LE(offset + 28);
    const extraSize = bytes.readUInt16LE(offset + 30);
    const commentSize = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameSize + extraSize + commentSize;
    if (next > end || flags & 0x2041 || ![0, 8].includes(method) || bytes.readUInt16LE(offset + 34) ||
        [compressedSize, expandedSize, local].includes(0xffffffff)) invalid();
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    if (!name || names.has(name) || name.startsWith('/') || name.includes('\\') || name.includes('//') ||
        name.split('/').some(part => part === '..' || part === '.') || /[\u0000-\u001f]/.test(name)) invalid();
    names.add(name);
    // ZIP64 and Unicode Path can change the effective entry name seen by JSZip. Reject both header variants.
    inspectExtra(bytes, offset + 46 + nameSize, extraSize);
    if (local + 30 > directoryOffset || bytes.readUInt32LE(local) !== 0x04034b50 ||
        bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) invalid();
    const localNameSize = bytes.readUInt16LE(local + 26);
    const start = local + 30 + localNameSize + bytes.readUInt16LE(local + 28);
    inspectExtra(bytes, local + 30 + localNameSize, bytes.readUInt16LE(local + 28));
    if (start + compressedSize > directoryOffset ||
        !bytes.subarray(local + 30, local + 30 + localNameSize).equals(bytes.subarray(offset + 46, offset + 46 + nameSize))) invalid();
    ranges.push([local, start + compressedSize]);
    enforceLimit(expandedSize <= limits.maxEntryBytes && expanded + expandedSize <= limits.maxExpandedBytes &&
      expandedSize <= Math.max(1, compressedSize) * limits.maxCompressionRatio);
    let content: Buffer;
    try {
      const payload = bytes.subarray(start, start + compressedSize);
      content = method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: Math.min(limits.maxEntryBytes, limits.maxExpandedBytes - expanded) + 1 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new DocumentError('DOCUMENT_LIMIT_EXCEEDED');
      invalidArchive();
    }
    enforceLimit(content.length <= limits.maxEntryBytes && expanded + content.length <= limits.maxExpandedBytes);
    if (content.length !== expandedSize) invalid();
    const worksheetMatch = /xl\/worksheets\/sheet(\d+)[.]xml/.exec(name);
    if (worksheetMatch && name !== `xl/worksheets/sheet${worksheetMatch[1]}.xml`) invalid();
    if (name === 'xl/workbook.xml') inspectDefinedNames(content.toString('utf8'), limits);
    else if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      worksheetCount++;
      const shape = inspectWorksheet(content.toString('utf8'), limits);
      worksheetCells += shape.cells;
      worksheetRows += shape.rows;
      enforceLimit(worksheetCount <= limits.maxSheets && worksheetCells <= limits.maxCells && worksheetRows <= limits.maxRows);
    } else if (/\.(?:xml|rels|vml)$/.test(name)) parseXml(content.toString('utf8'), xmlParser());
    expanded += content.length;
    offset = next;
  }
  if (offset !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) invalid();
  ranges.sort((left, right) => left[0] - right[0]);
  if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1])) invalid();
}

function address(value: string): [number, number] {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(value);
  if (!match) throw new DocumentError('INVALID_XLSX_ARCHIVE');
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  return [Number(match[2]), column];
}
function xmlParser(onOpen: (node: XmlTag) => void = () => {}): SaxesParser<{ xmlns: true }> {
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', node => {
    // ExcelJS dispatches SpreadsheetML by unprefixed names and silently skips qualified equivalents.
    if (node.prefix && spreadsheetNamespaces.has(node.uri)) invalidArchive();
    onOpen({ name: node.name, attributes: Object.fromEntries(Object.entries(node.attributes).map(([key, attribute]) => [key, attribute.value])) });
  });
  return parser;
}
function parseXml(xml: string, parser: SaxesParser<{ xmlns: true }>): void {
  parser.on('doctype', invalidArchive);
  // ExcelJS drops CDATA text events. Refuse an incomplete extraction until a reviewed lossless path exists.
  parser.on('cdata', invalidArchive);
  try { parser.write(xml).close(); }
  catch (error) {
    if (error instanceof DocumentError) throw error;
    invalidArchive();
  }
}
/** ExcelJS expands merge rectangles and sparse row indices while loading. Bound these before load. */
function inspectWorksheet(xml: string, limits: DocumentLimits): { rows: number; cells: number } {
  let maximumRow = 0;
  let maximumColumn = 0;
  let mergeCells = 0;
  let rowTags = 0;
  let cellTags = 0;
  let validationCells = 0;
  let columnDeclarations = 0;
  const parser = xmlParser(node => {
    if (!['row', 'c', 'mergeCell', 'col', 'dataValidation'].includes(node.name)) return;
    const parsed = node.attributes;
    const coordinate = parsed[node.name === 'mergeCell' ? 'ref' : 'r'];
    if (node.name === 'col') {
      const minimum = Number(parsed.min);
      const maximum = Number(parsed.max);
      columnDeclarations += maximum - minimum + 1;
      enforceLimit(Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum) && minimum > 0 && maximum >= minimum &&
        maximum <= Math.min(16_384, limits.maxCells) && columnDeclarations <= limits.maxCells);
      return;
    }
    if (node.name === 'dataValidation') {
      for (const range of (parsed.sqref ?? '').trim().split(/\s+/)) validationCells += rangeCells(range, limits);
      enforceLimit(validationCells <= limits.maxCells);
      return;
    }
    if (node.name === 'row') {
      rowTags++;
      const row = coordinate ? Number(coordinate) : rowTags;
      enforceLimit(Number.isSafeInteger(row) && row > 0 && row <= limits.maxRows && rowTags <= limits.maxRows);
      maximumRow = Math.max(maximumRow, row);
      return;
    }
    if (!coordinate) throw new DocumentError('INVALID_XLSX_ARCHIVE');
    const parts = coordinate.split(':');
    const [row, column] = address(parts[0]);
    const [endRow, endColumn] = address(parts[1] ?? parts[0]);
    enforceLimit(endRow >= row && endColumn >= column && endRow <= limits.maxRows && endColumn <= limits.maxCells);
    maximumRow = Math.max(maximumRow, endRow);
    maximumColumn = Math.max(maximumColumn, endColumn);
    if (node.name === 'mergeCell') mergeCells += (endRow - row + 1) * (endColumn - column + 1);
    else cellTags++;
    enforceLimit(mergeCells <= limits.maxCells && cellTags <= limits.maxCells && maximumRow * maximumColumn <= limits.maxCells);
  });
  parseXml(xml, parser);
  return { rows: maximumRow, cells: maximumRow * maximumColumn };
}

function rangeCells(range: string, limits: DocumentLimits): number {
  const parts = range.replaceAll('$', '').split(':');
  const [row, column] = address(parts[0]);
  const [endRow, endColumn] = address(parts[1] ?? parts[0]);
  const cells = (endRow - row + 1) * (endColumn - column + 1);
  enforceLimit(endRow >= row && endColumn >= column && endRow <= limits.maxRows && endColumn <= 16_384 && cells <= limits.maxCells);
  return cells;
}

/** DefinedNames.model expands rectangular names in ExcelJS's CellMatrix during workbook assignment. */
function inspectDefinedNames(xml: string, limits: DocumentLimits): void {
  let cells = 0;
  let name: InstanceType<typeof DefinedNameXform> | undefined;
  const parser = xmlParser(node => {
    if (name) invalidArchive();
    if (node.name === 'definedName') { name = new DefinedNameXform(); name.parseOpen(node); }
  });
  // ExcelJS's parse-sax forwards text events and ignores comments/CDATA. Reuse its range extractor and decoder.
  parser.on('text', text => name?.parseText(text));
  parser.on('closetag', node => {
    if (node.name !== 'definedName' || !name) return;
    name.parseClose();
    for (const range of name.model.ranges) {
      if (!/[$](\w+)[$](\d+)(:[$](\w+)[$](\d+))?/.test(range.split('!').pop() ?? '')) continue;
      const decoded = columnCache.decodeEx(range);
      if (decoded.top !== undefined) {
        const { top, bottom, left, right } = decoded as Required<Pick<DecodedRange, 'top' | 'bottom' | 'left' | 'right'>>;
        enforceLimit([top, bottom, left, right].every(Number.isSafeInteger) && top > 0 && left > 0 && bottom <= limits.maxRows && right <= 16_384);
        cells += (bottom - top + 1) * (right - left + 1);
      } else cells++;
    }
    enforceLimit(cells <= limits.maxCells);
    name = undefined;
  });
  parseXml(xml, parser);
}
