import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArtifact, parserEnvironment } from '../src/parsers/document.ts';
import { documentLimits } from '../src/parsers/limits.ts';
import { inspectXlsxZip } from '../src/parsers/zip.ts';
import { chinesePdf, mergedWorkbook, textPdf, worksheetArchive } from './document-fixtures.ts';

test('text PDF preserves repeated cross-page headers, continuation lines, exact words and coordinates', { timeout: 30_000 }, async () => {
  const result = await parseArtifact('pdf', textPdf([['Job / Requirement', 'P-1 / 2027 and later'], ['Job / Requirement', 'P-1 continued / 27 preferred']]));
  assert.equal(result.parseState, 'present', JSON.stringify(result));
  assert.equal(result.complete, true);
  assert.equal(result.document?.kind, 'pdf');
  if (result.document?.kind !== 'pdf') return;
  assert.equal(result.document.pages.length, 2);
  assert.match(result.document.pages[0].raw, /2027 and later/);
  assert.match(result.document.pages[1].raw, /27 preferred/);
  for (const page of result.document.pages) {
    assert.match(page.raw, /Job \/ Requirement/);
    assert.equal(page.lines[0].locator, `page:${page.page}/line:1`);
    assert.equal(page.items[0].transform.length, 6);
    assert.equal(page.paragraphs[0].locator, `page:${page.page}/paragraph:1`);
  }
});

test('Chinese Type0 PDF with embedded ToUnicode preserves graduation boundaries, preference wording and coordinates', { timeout: 30_000 }, async () => {
  const lines = [['岗位 / 资格要求', '实习岗位 2027届及以后毕业'], ['岗位 / 资格要求', '27届同学优先，欢迎26届同学投递']];
  const result = await parseArtifact('pdf', chinesePdf(lines));
  assert.equal(result.parseState, 'present', JSON.stringify(result));
  assert.equal(result.complete, true);
  if (result.document?.kind !== 'pdf') return assert.fail('expected a Chinese PDF document');
  for (const [index, page] of result.document.pages.entries()) {
    assert.equal(page.raw, lines[index].join('\n'));
    assert.equal(page.items.map(item => item.raw).join(''), lines[index].join(''));
    assert.equal(page.lines[1].locator, `page:${index + 1}/line:2`);
    assert.ok(page.items.every(item => item.transform.length === 6 && item.transform.every(Number.isFinite)));
  }
});

test('blank PDF needs OCR, page/text ceilings and malformed input produce explicit incomplete results', { timeout: 30_000 }, async () => {
  assert.equal((await parseArtifact('pdf', textPdf([[]]))).parseState, 'needs_ocr');
  const limited = await parseArtifact('pdf', textPdf([['first'], ['second']]), { maxPages: 1 });
  assert.equal(limited.parseState, 'limit_exceeded');
  assert.equal(limited.complete, false);
  assert.equal(limited.document, null);
  assert.equal((await parseArtifact('pdf', textPdf([['12345']]), { maxTextChars: 3 })).parseState, 'limit_exceeded');
  assert.equal((await parseArtifact('pdf', Buffer.from('broken'))).parseState, 'parse_failed');
});

test('XLSX preserves merged anchors, blank rows, continuation wording and inert formula/cache values', { timeout: 30_000 }, async () => {
  const result = await parseArtifact('xlsx', await mergedWorkbook());
  assert.equal(result.parseState, 'present', JSON.stringify(result));
  if (result.document?.kind !== 'xlsx') return assert.fail('expected XLSX document');
  const sheet = result.document.sheets[0];
  assert.equal(sheet.name, '岗位明细');
  assert.deepEqual(sheet.merges, ['A1:C1']);
  assert.equal(sheet.rows[0].cells[1].mergedMaster, 'A1');
  assert.equal(sheet.rows[0].cells[1].mergedRange, 'A1:C1');
  assert.equal(sheet.rows[0].cells[0].raw, '2027届及以后毕业，27届优先');
  assert.equal(sheet.rows[3].cells[1].raw, '续行，欢迎26届同学投递');
  assert.equal(sheet.rows[4].empty, true);
  assert.equal(sheet.rows[5].cells[1].formula, '1+2');
  assert.equal(sheet.rows[5].cells[1].cached, 3);
  assert.equal(sheet.rows[5].cells[2].cached, null);
  assert.equal(sheet.rows[5].cells[2].formula, 'HYPERLINK("https://external.invalid/", "链接")');
  assert.equal(sheet.rows[6].cells[0].hyperlink, 'https://external.invalid/row');
  assert.equal(sheet.rows[3].cells[1].locator, 'sheet:1/row:4/cell:B4');
});

test('archive expansion, row, cell and parser deadline ceilings fail without truncated documents', { timeout: 30_000 }, async () => {
  const bytes = await mergedWorkbook();
  assert.throws(() => inspectXlsxZip(bytes, documentLimits({ maxExpandedBytes: 100 })), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  assert.throws(() => inspectXlsxZip(bytes, documentLimits({ maxRows: 2 })), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  assert.throws(() => inspectXlsxZip(bytes, documentLimits({ maxCells: 2 })), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  const limited = await parseArtifact('xlsx', bytes, { maxTextChars: 5 });
  assert.equal(limited.parseState, 'limit_exceeded');
  const timedOut = await parseArtifact('xlsx', bytes, { timeoutMs: 1 });
  assert.equal(timedOut.errorCode, 'DOCUMENT_PARSE_TIMEOUT');
  assert.equal(timedOut.document, null);
});

test('parser environment removes credentials, proxy, preload and native font configuration', () => {
  assert.deepEqual(parserEnvironment({ CATALOG_DATABASE_URL: 'secret', HTTPS_PROXY: 'secret', NODE_OPTIONS: '--inspect',
    NAPI_RS_NATIVE_LIBRARY_PATH: 'private', HOME: 'private', DISABLE_SYSTEM_FONTS_LOAD: '0', SystemRoot: 'C:\\Windows' }),
  { DISABLE_SYSTEM_FONTS_LOAD: '1', SystemRoot: 'C:\\Windows' });
});

test('ZIP preflight rejects forged expanded sizes and giant or entity-encoded merged ranges before ExcelJS', () => {
  assert.throws(() => inspectXlsxZip(worksheetArchive('x'.repeat(20_000), 1), documentLimits({ maxEntryBytes: 1_000 })), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  for (const range of ['A1:XFD1048576', 'A1&#58;XFD1048576']) {
    assert.throws(() => inspectXlsxZip(worksheetArchive(`<worksheet><mergeCells><mergeCell ref="${range}"/></mergeCells></worksheet>`), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  }
  assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet><sheetData><row r="\n1000000"><c r="A1"/></row></sheetData></worksheet>'), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet><sheetData><row data="r=1>" r="1000000"><c r="A1"/></row></sheetData></worksheet>'), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet><sheetData><row data="r=\'1\'" r="1000000"><c r="A1"/></row></sheetData></worksheet>'), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet><cols><col min="1" max="1000000"/></cols></worksheet>'), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet><dataValidations><dataValidation sqref="A1:XFD1048576"/></dataValidations></worksheet>'), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
  assert.throws(() => inspectXlsxZip(worksheetArchive('<worksheet/>', undefined, '<workbook><definedNames><definedName name="large">Sheet1!$A$1:$XFD$1048576</definedName></definedNames></workbook>'), documentLimits()), { code: 'DOCUMENT_LIMIT_EXCEEDED' });
});

test('sequential batch releases child processes and supervisor timers after success and forced termination', { timeout: 30_000 }, async t => {
  const ownedProcesses = () => process.getActiveResourcesInfo().filter(resource => resource === 'ProcessWrap').length;
  const awaitChildRelease = async () => {
    const deadline = performance.now() + 500;
    // Node can emit close before destroying ProcessWrap. Observe quiescence at both measurement boundaries.
    for (let turn = 0; turn < 20 && ownedProcesses() !== 0 && performance.now() < deadline; turn++) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    assert.equal(ownedProcesses(), 0);
  };
  await awaitChildRelease();
  const before = process.memoryUsage().rss;
  for (let index = 0; index < 3; index++) {
    assert.equal((await parseArtifact('pdf', textPdf([[`batch ${index}`]]))).parseState, 'present');
  }
  assert.equal((await parseArtifact('pdf', textPdf([['timeout']]), { timeoutMs: 1 })).errorCode, 'DOCUMENT_PARSE_TIMEOUT');
  await awaitChildRelease();
  t.diagnostic(JSON.stringify({ parentRssBeforeBytes: before, parentRssAfterBytes: process.memoryUsage().rss, activeChildResources: ownedProcesses() }));
});
