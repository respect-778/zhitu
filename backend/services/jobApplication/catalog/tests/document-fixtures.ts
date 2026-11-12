import { deflateRawSync } from 'node:zlib';

/** Deterministic real PDF bytes. Object offsets and xref are calculated, including two separate page streams. */
export function textPdf(pageLines: string[][]): Buffer {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageLines.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pageLines.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (const [index, lines] of pageLines.entries()) {
    const contentId = 5 + index * 2;
    const stream = `BT /F1 12 Tf 50 750 Td ${lines.map((line, row) => `${row ? '0 -18 Td ' : ''}(${line.replace(/[\\()]/g, value => `\\${value}`)}) Tj`).join('\n')} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  return serializePdf(objects);
}

function serializePdf(objects: string[]): Buffer {
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossReference = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
  return Buffer.from(result);
}

/** A real two-byte Type0 text layer with an embedded ToUnicode CMap. No external fonts or resources are needed. */
export function chinesePdf(pageLines: string[][]): Buffer {
  const characters = [...new Set(pageLines.flat().join(''))];
  const code = (character: string) => (characters.indexOf(character) + 1).toString(16).padStart(4, '0');
  const mappings = characters.map(character => `<${code(character)}> <${character.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n');
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /FixtureUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${characters.length} beginbfchar\n${mappings}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageLines.map((_, index) => `${7 + index * 2} 0 R`).join(' ')}] /Count ${pageLines.length} >>`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /FixtureChinese /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /FixtureChinese /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 1000 /CIDToGIDMap /Identity >>',
    '<< /Type /FontDescriptor /FontName /FixtureChinese /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>',
    `<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`,
  ];
  for (const [index, lines] of pageLines.entries()) {
    const content = `BT /F1 12 Tf 50 750 Td ${lines.map((line, row) => `${row ? '0 -18 Td ' : ''}<${[...line].map(code).join('')}> Tj`).join('\n')} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${8 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  return serializePdf(objects);
}

export async function mergedWorkbook(): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('岗位明细');
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = '2027届及以后毕业，27届优先';
  sheet.addRow(['岗位编号', '资格', '备注']);
  sheet.addRow(['P-1', '2027届及以后', '27届优先']);
  sheet.getCell('B4').value = '续行，欢迎26届同学投递';
  sheet.getCell('A6').value = 'P-2';
  sheet.getCell('B6').value = { formula: '1+2', result: 3 };
  sheet.getCell('C6').value = { formula: 'HYPERLINK("https://external.invalid/", "链接")' };
  sheet.getCell('A7').value = { text: '原文链接', hyperlink: 'https://external.invalid/row' };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Synthetic archive builder permits deliberately inconsistent central sizes for expansion-boundary regression. */
export function worksheetArchive(xml: string, declaredSize?: number, workbookXml = '<workbook/>',
  options: { worksheetName?: string; localExtra?: Buffer; centralExtra?: Buffer } = {}): Buffer {
  const worksheetName = options.worksheetName ?? 'xl/worksheets/sheet1.xml';
  const entries = [['[Content_Types].xml', '<Types/>'], ['xl/workbook.xml', workbookXml], [worksheetName, xml]];
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const localExtra = name === worksheetName ? options.localExtra ?? Buffer.alloc(0) : Buffer.alloc(0);
    const centralExtra = name === worksheetName ? options.centralExtra ?? Buffer.alloc(0) : Buffer.alloc(0);
    const payload = deflateRawSync(Buffer.from(content));
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(name === worksheetName && declaredSize !== undefined ? declaredSize : Buffer.byteLength(content), 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(name === worksheetName && declaredSize !== undefined ? declaredSize : Buffer.byteLength(content), 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt32LE(offset, 42);
    const entry = Buffer.concat([local, nameBytes, localExtra, payload]);
    locals.push(entry);
    directory.push(Buffer.concat([central, nameBytes, centralExtra]));
    offset += entry.length;
  }
  const centralBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

export function unicodePathExtra(original: string, effective: string): Buffer {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(original)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const name = Buffer.from(effective);
  const extra = Buffer.alloc(9 + name.length);
  extra.writeUInt16LE(0x7075);
  extra.writeUInt16LE(5 + name.length, 2);
  extra.writeUInt8(1, 4);
  extra.writeUInt32LE((crc ^ 0xffffffff) >>> 0, 5);
  name.copy(extra, 9);
  return extra;
}
