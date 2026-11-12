import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { MAX_PARSER_DEPENDENCIES, parserDependencyPaths, parserReadPaths } from '../src/parsers/dependencies.ts';
import { parseArtifact, parseChildResult, parserEnvironment } from '../src/parsers/document.ts';
import { documentLimits, parserVersion } from '../src/parsers/limits.ts';
import { inspectXlsxZip } from '../src/parsers/zip.ts';
import { mergedWorkbook, textPdf, unicodePathExtra, worksheetArchive } from './document-fixtures.ts';

const require = createRequire(import.meta.url);
const JSZip = require('jszip') as { loadAsync(bytes: Buffer): Promise<{
  files: Record<string, unknown>; file(name: string): { async(kind: 'string'): Promise<string> };
  file(name: string, content: string): void; generateAsync(options: { type: 'nodebuffer' }): Promise<Buffer>;
}> };

test('actual Node read grants deny workspace junction and direct storage config while allowing a required package manifest', () => {
  const modules = fileURLToPath(new URL('../../../../node_modules/', import.meta.url));
  for (const kind of ['pdf', 'xlsx'] as const) {
    const packages = parserDependencyPaths(kind);
    assert.ok(packages.length > 0 && packages.length <= MAX_PARSER_DEPENDENCIES);
    assert.ok(packages.every(path => realpathSync(path) === path && !path.includes('@napi-rs')));
    const grants = parserReadPaths(kind);
    assert.equal(grants.includes(modules), false);
    const viaWorkspace = join(modules, '@knowvia', 'job-catalog', 'src', 'storage', 'config.ts');
    const direct = fileURLToPath(new URL('../src/storage/config.ts', import.meta.url));
    const probe = `import{readFileSync}from'node:fs';let result=[];for(const path of process.argv.slice(1)){try{readFileSync(path);result.push('allowed')}catch(error){result.push(error.code)}}console.log(JSON.stringify(result))`;
    const result = spawnSync(process.execPath, ['--permission', '--no-addons', '--disallow-code-generation-from-strings',
      ...grants.map(path => `--allow-fs-read=${path}`), '--input-type=module', '-e', probe,
      viaWorkspace, direct, join(packages[0], 'package.json')],
    { env: parserEnvironment(), shell: false, windowsHide: true, timeout: 5_000, encoding: 'utf8', maxBuffer: 1024 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ['ERR_ACCESS_DENIED', 'ERR_ACCESS_DENIED', 'allowed']);
  }
});

test('Unicode Path in either ZIP header cannot redirect an ignored entry into an ExcelJS worksheet', async () => {
  const extra = unicodePathExtra('ignored.xml', 'xl/worksheets/sheet1.xml');
  const xml = '<worksheet><mergeCells><mergeCell ref="A1:XFD1048576"/></mergeCells></worksheet>';
  for (const variants of [{ centralExtra: extra }, { localExtra: extra }, { centralExtra: extra, localExtra: extra }]) {
    const bytes = worksheetArchive(xml, undefined, undefined, { worksheetName: 'ignored.xml', ...variants });
    assert.throws(() => inspectXlsxZip(bytes, documentLimits()), { code: 'INVALID_XLSX_ARCHIVE' });
  }
  // List ZIP names only. Never load a workbook or expand the intentionally enormous merge.
  const bytes = worksheetArchive(xml, undefined, undefined, { worksheetName: 'ignored.xml', centralExtra: extra, localExtra: extra });
  assert.equal(bytes.length, 484);
  assert.ok(Object.hasOwn((await JSZip.loadAsync(bytes)).files, 'xl/worksheets/sheet1.xml'));
});

test('noncanonical paths accepted by ExcelJS substring matching or JSZip normalization are rejected before dispatch', () => {
  for (const worksheetName of ['prefix/xl/worksheets/sheet1.xml', 'xl/worksheets/sheet1.xml.suffix',
    'xl/./worksheets/sheet1.xml', 'xl//worksheets/sheet1.xml']) {
    const bytes = worksheetArchive('<worksheet/>', undefined, undefined, { worksheetName });
    assert.throws(() => inspectXlsxZip(bytes, documentLimits()), { code: 'INVALID_XLSX_ARCHIVE' });
  }
});

test('a small corrupt DEFLATE stream is parse_failed while actual output expansion remains limit_exceeded', { timeout: 30_000 }, async () => {
  const bytes = worksheetArchive('<worksheet/>');
  const payload = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  bytes[payload] = 0x07; // BTYPE=3 is invalid, independently of output budgets.
  assert.equal(bytes.length, 403);
  assert.throws(() => inflateRawSync(bytes.subarray(payload, payload + bytes.readUInt32LE(18))), { code: 'Z_DATA_ERROR' });
  assert.throws(() => inspectXlsxZip(bytes, documentLimits()), { code: 'INVALID_XLSX_ARCHIVE' });
  const result = await parseArtifact('xlsx', bytes);
  assert.equal(result.parseState, 'parse_failed');
  assert.equal(result.errorCode, 'INVALID_XLSX_ARCHIVE');
  assert.equal(result.complete, false);
  assert.equal(result.document, null);
  const expanding = worksheetArchive('x'.repeat(20_000), 1);
  assert.throws(() => inspectXlsxZip(expanding, documentLimits({ maxEntryBytes: 1_000 })), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
});

test('XML-decoded named ranges preserve comments, references and whitespace semantics before bounding expansion', () => {
  for (const value of ['Sheet1!$A$1:<!--split-->$XFD$20000', 'Sheet1!&#36;A&#36;1:&#36;XFD&#36;20000',
    'Sheet1!$A$1 : $XFD$20000']) {
    const workbook = `<workbook><definedNames><definedName name="large">${value}</definedName></definedNames></workbook>`;
    assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet/>', undefined, workbook), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  }
  const ordinary = '<workbook><definedNames><definedName name="small">&apos;Sheet, 1&apos;!$A$1:$C$2</definedName></definedNames></workbook>';
  assert.doesNotThrow(() => inspectXlsxZip(worksheetArchive('<worksheet/>', undefined, ordinary), documentLimits()));
  assert.throws(() => inspectXlsxZip(worksheetArchive('<!DOCTYPE worksheet [<!ENTITY e "A1">]><worksheet/>'), documentLimits()), { code: 'INVALID_XLSX_ARCHIVE' });
});

test('CDATA in shared strings, inline strings and defined names returns explicit incomplete parse state', { timeout: 30_000 }, async () => {
  const zip = await JSZip.loadAsync(await mergedWorkbook());
  const shared = await zip.file('xl/sharedStrings.xml').async('string');
  assert.ok(shared.includes('<t>2027届及以后毕业，27届优先</t>'));
  zip.file('xl/sharedStrings.xml', shared.replace('<t>2027届及以后毕业，27届优先</t>', '<t><![CDATA[2027届及以后毕业，27届优先]]></t>'));
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  assert.throws(() => inspectXlsxZip(bytes, documentLimits()), { code: 'INVALID_XLSX_ARCHIVE' });
  const result = await parseArtifact('xlsx', bytes);
  assert.equal(result.parseState, 'parse_failed');
  assert.equal(result.complete, false);
  assert.equal(result.document, null);
  const inline = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t><![CDATA[2027届及以后]]></t></is></c></row></sheetData></worksheet>';
  assert.throws(() => inspectXlsxZip(worksheetArchive(inline), documentLimits()), { code: 'INVALID_XLSX_ARCHIVE' });
  const named = '<workbook><definedNames><definedName name="large">Sheet1!$A$1:<![CDATA[ignored]]>$XFD$20000</definedName></definedNames></workbook>';
  assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet/>', undefined, named), documentLimits()), { code: 'INVALID_XLSX_ARCHIVE' });
});

test('qualified SpreadsheetML core elements fail explicitly while qualified attributes and non-core extensions retain text', { timeout: 30_000 }, async () => {
  const original = await mergedWorkbook();
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const originalQuote = '2027届及以后毕业，27届优先';
  const cases = [
    { path: 'xl/worksheets/sheet1.xml', rewrite: (xml: string) => xml.replace(/<c r="A1"[^>]*>[\s\S]*?<\/c>/,
      `<c r="A1" t="inlineStr"><is><x:t>${originalQuote}</x:t></is></c>`) },
    { path: 'xl/worksheets/sheet1.xml', rewrite: (xml: string) => xml.replaceAll('<row ', '<x:row ').replaceAll('</row>', '</x:row>') },
    { path: 'xl/sharedStrings.xml', rewrite: (xml: string) => xml.replaceAll('<t>', '<x:t>').replaceAll('</t>', '</x:t>') },
    { path: 'xl/workbook.xml', rewrite: (xml: string) => xml.replaceAll('<sheet ', '<x:sheet ') },
  ];
  for (const fixture of cases) {
    const zip = await JSZip.loadAsync(original);
    const xml = await zip.file(fixture.path).async('string');
    const rewritten = fixture.rewrite(xml).replace(/<(worksheet|sst|workbook)\b/, `<$1 xmlns:x="${namespace}"`);
    assert.notEqual(rewritten, xml);
    zip.file(fixture.path, rewritten);
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const before = Buffer.from(bytes);
    const result = await parseArtifact('xlsx', bytes);
    assert.equal(result.parseState, 'parse_failed', fixture.path);
    assert.equal(result.errorCode, 'INVALID_XLSX_ARCHIVE');
    assert.equal(result.complete, false);
    assert.equal(result.document, null);
    assert.deepEqual(bytes, before);
  }
  const zip = await JSZip.loadAsync(original);
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  zip.file('xl/worksheets/sheet1.xml', sheet.replace('<worksheet', '<worksheet xmlns:ext="urn:fixture:extension"')
    .replace('</worksheet>', '<extLst><ext uri="urn:fixture:extension"><ext:annotation>extra format</ext:annotation></ext></extLst></worksheet>'));
  const strings = await zip.file('xl/sharedStrings.xml').async('string');
  zip.file('xl/sharedStrings.xml', strings.replace(`<t>${originalQuote}</t>`, `<t xml:space="preserve">${originalQuote}</t>`));
  const normal = await parseArtifact('xlsx', await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(normal.parseState, 'present', JSON.stringify(normal));
  assert.equal(normal.complete, true);
  if (normal.document?.kind !== 'xlsx') return assert.fail('expected preserved workbook text');
  assert.equal(normal.document.sheets[0].rows[0].cells[0].raw, originalQuote);
});

test('fake child envelopes cannot claim completion with missing evidence, wrong kind/version or dependency diagnostics', { timeout: 30_000 }, async () => {
  const valid = await parseArtifact('pdf', textPdf([['2027 and later']]));
  assert.equal(valid.parseState, 'present');
  assert.deepEqual(parseChildResult(valid, 'pdf'), valid);
  for (const invalid of [{}, { ...valid, extra: 'unexpected' }, { ...valid, document: null },
    { ...valid, parserVersion: parserVersion('xlsx') }, { ...valid, complete: false },
    { ...valid, parseState: 'needs_ocr' }, { ...valid, errorCode: 'raw private dependency diagnostics' }]) {
    assert.throws(() => parseChildResult(invalid, 'pdf'));
  }
  const failure = { parserVersion: parserVersion('pdf'), parseState: 'parse_failed', complete: false,
    errorCode: 'DOCUMENT_PARSE_FAILED', document: null };
  assert.throws(() => parseChildResult(failure, 'xlsx'));
  assert.throws(() => parseChildResult({ ...failure, complete: true }, 'pdf'));
  assert.deepEqual(parseChildResult(failure, 'pdf'), failure);
});
