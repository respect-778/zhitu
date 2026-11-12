import type { CellScalar, XlsxCell, XlsxDocument } from '../../contracts/artifacts.ts';
import { enforceLimit, type DocumentLimits } from './limits.ts';
import { inspectXlsxZip } from './zip.ts';
import type { CellValue } from 'exceljs';

function scalar(value: unknown): CellScalar {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'error' in value) return String(value.error);
  return null;
}
function text(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object' || value instanceof Date) return String(scalar(value) ?? '');
  if ('richText' in value) return value.richText.map(part => part.text).join('');
  if ('text' in value) return value.text;
  if ('error' in value) return value.error;
  return String(scalar('result' in value ? value.result : null) ?? '');
}

export async function parseXlsx(bytes: Buffer, limits: DocumentLimits): Promise<XlsxDocument> {
  inspectXlsxZip(bytes, limits);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  // ExcelJS reads OOXML. It does not evaluate formulas, execute VBA, or fetch hyperlink targets.
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  enforceLimit(workbook.worksheets.length <= limits.maxSheets);
  const sheets: XlsxDocument['sheets'] = [];
  let rows = 0;
  let cells = 0;
  let characters = 0;
  for (const [index, sheet] of workbook.worksheets.entries()) {
    rows += sheet.rowCount;
    cells += sheet.rowCount * sheet.columnCount;
    enforceLimit(rows <= limits.maxRows && cells <= limits.maxCells);
    const locator = `sheet:${index + 1}`;
    const merges = [...(sheet.model.merges ?? [])];
    const result = { sheet: index + 1, name: sheet.name, rows: [] as XlsxDocument['sheets'][number]['rows'], merges, locator };
    characters += sheet.name.length + merges.join('').length;
    for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      const rowCells: XlsxCell[] = [];
      for (let column = 1; column <= sheet.columnCount; column++) {
        const cell = row.getCell(column);
        const value = cell.value;
        const formula = cell.type === ExcelJS.ValueType.Formula ? cell.formula : null;
        const cached = formula !== null && value && typeof value === 'object' && 'result' in value ? scalar(value.result) : null;
        const raw = text(value);
        const hyperlink = value && typeof value === 'object' && 'hyperlink' in value ? value.hyperlink : null;
        const mergedMaster = cell.isMerged ? cell.master.address : null;
        const mergedRange = mergedMaster ? merges.find(range => range.split(':')[0] === mergedMaster) ?? null : null;
        characters += raw.length + (formula?.length ?? 0) + (hyperlink?.length ?? 0);
        enforceLimit(characters <= limits.maxTextChars);
        rowCells.push({ row: rowIndex, column, address: cell.address, raw,
          value: formula !== null ? cached : scalar(value) ?? (raw || null), formula, cached,
          hyperlink, mergedMaster, mergedRange, locator: `${locator}/row:${rowIndex}/cell:${cell.address}` });
      }
      result.rows.push({ row: rowIndex, empty: rowCells.every(cell => !cell.raw && cell.formula === null), cells: rowCells, locator: `${locator}/row:${rowIndex}` });
    }
    sheets.push(result);
  }
  return { kind: 'xlsx', sheets };
}
