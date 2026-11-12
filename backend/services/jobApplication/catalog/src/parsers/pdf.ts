import type { PdfDocument, PdfLine, PdfParagraph, PdfTextItem } from '../../contracts/artifacts.ts';
import { DocumentError, enforceLimit, type DocumentLimits } from './limits.ts';

class NoExternalResources {
  async fetch(): Promise<never> { throw new DocumentError('PDF_EXTERNAL_RESOURCE_REJECTED'); }
}

function locateLines(items: PdfTextItem[], page: number): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | undefined;
  let ended = false;
  for (const item of items) {
    const [x, y] = item.transform.slice(4);
    if (!current || ended || Math.abs(current.y - y) > Math.max(2, item.height * 0.4)) {
      current = { line: lines.length + 1, raw: '', itemIndices: [], x, y, locator: `page:${page}/line:${lines.length + 1}` };
      lines.push(current);
    }
    current.raw += item.raw;
    current.itemIndices.push(item.index);
    ended = item.hasEOL;
  }
  return lines;
}
function locateParagraphs(lines: PdfLine[], page: number): PdfParagraph[] {
  const paragraphs: PdfParagraph[] = [];
  let previous: PdfLine | undefined;
  for (const line of lines) {
    let paragraph = paragraphs.at(-1);
    const lineGap = previous ? Math.abs(previous.y - line.y) : 0;
    if (!paragraph || !previous?.raw.trim() || lineGap > 24) {
      paragraph = { paragraph: paragraphs.length + 1, raw: '', lineNumbers: [], locator: `page:${page}/paragraph:${paragraphs.length + 1}` };
      paragraphs.push(paragraph);
    }
    paragraph.raw += `${paragraph.lineNumbers.length ? '\n' : ''}${line.raw}`;
    paragraph.lineNumbers.push(line.line);
    previous = line;
  }
  return paragraphs;
}

/** Text extraction only. Page order, repeated headers, continuations and exact item strings survive. */
export async function parsePdf(bytes: Buffer, limits: DocumentLimits): Promise<PdfDocument> {
  if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new DocumentError('INVALID_PDF');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: Uint8Array.from(bytes), verbosity: 0, stopAtErrors: true,
    useWorkerFetch: false, BinaryDataFactory: NoExternalResources,
    disableFontFace: true, useSystemFonts: false, useWasm: false, enableXfa: false,
    disableRange: true, disableStream: true, disableAutoFetch: true,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, maxImageSize: 1,
  });
  const pages: PdfDocument['pages'] = [];
  let textChars = 0;
  let itemCount = 0;
  try {
    const document = await task.promise;
    enforceLimit(document.numPages <= limits.maxPages);
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const items: PdfTextItem[] = [];
        const reader = page.streamTextContent({ disableNormalization: true }).getReader();
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            for (const value of chunk.value.items) {
              if (!('str' in value)) continue;
              textChars += value.str.length;
              itemCount++;
              enforceLimit(textChars <= limits.maxTextChars && itemCount <= limits.maxCells);
              items.push({ index: items.length, raw: value.str, transform: [...value.transform], width: value.width, height: value.height, hasEOL: value.hasEOL });
            }
          }
        } finally { await reader.cancel(new Error('Attachment text reader closed.')); }
        const lines = locateLines(items, number);
        pages.push({ page: number, width: viewport.width, height: viewport.height,
          raw: lines.map(line => line.raw).join('\n'), items, lines, paragraphs: locateParagraphs(lines, number),
          parseState: items.some(item => item.raw.trim()) ? 'present' : 'needs_ocr', locator: `page:${number}` });
      } finally { page.cleanup(); }
    }
    return { kind: 'pdf', pages };
  } finally { await task.destroy(); }
}
