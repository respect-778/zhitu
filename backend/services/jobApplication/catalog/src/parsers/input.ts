import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, parse } from 'node:path';
import type { ArtifactKind } from '../../contracts/artifacts.ts';
import { DocumentError, DOCUMENT_LIMITS } from './limits.ts';

export function assertLocalPath(input: string): void {
  if (typeof input !== 'string' || input.length > 1024 || !isAbsolute(input) || normalize(input) !== input ||
      /[\u0000-\u001f\u007f]/.test(input) || input.startsWith('\\\\') ||
      input.includes(':', /^[A-Za-z]:/.test(input) ? 2 : 0) ||
      /^(?:\/proc|\/sys|\/dev|\/etc|\/run|\/var\/run)(?:\/|$)/.test(input)) throw new DocumentError('INPUT_PATH_REJECTED');
}
/** Same regular-file/ancestor/NOFOLLOW boundary as capture.ts, with binary attachment extensions. */
export async function assertPlainPath(input: string, missingAllowed = false): Promise<void> {
  assertLocalPath(input);
  let cursor = input;
  while (true) {
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() || (cursor !== input && !info.isDirectory())) throw new DocumentError('INPUT_PATH_REJECTED');
    } catch (error) {
      if (!missingAllowed || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw new DocumentError('INPUT_PATH_REJECTED');
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (!missingAllowed) {
    const resolved = await realpath(input);
    const same = process.platform === 'win32' ? resolved.toLowerCase() === input.toLowerCase() : resolved === input;
    if (!same) throw new DocumentError('INPUT_PATH_REJECTED');
  }
}
export async function readArtifactInput(input: string, maximumBytes = DOCUMENT_LIMITS.maxBytes): Promise<{ kind: ArtifactKind; bytes: Buffer }> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > DOCUMENT_LIMITS.maxBytes) throw new DocumentError('INVALID_DOCUMENT_LIMITS');
  assertLocalPath(input);
  const extension = parse(input).ext.toLowerCase();
  if (!['.pdf', '.xlsx'].includes(extension)) throw new DocumentError('UNSUPPORTED_DOCUMENT_FORMAT');
  await assertPlainPath(input);
  let file;
  try {
    file = await open(input, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await file.stat();
    if (!before.isFile() || before.size === 0) throw new DocumentError('INPUT_FILE_INVALID');
    if (before.size > maximumBytes) throw new DocumentError('DOCUMENT_LIMIT_EXCEEDED');
    const buffer = Buffer.alloc(before.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    const after = await file.stat();
    if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino) {
      throw new DocumentError('INPUT_FILE_CHANGED');
    }
    return { kind: extension === '.pdf' ? 'pdf' : 'xlsx', bytes: buffer.subarray(0, total) };
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError('INPUT_FILE_INVALID');
  } finally { await file?.close(); }
}
