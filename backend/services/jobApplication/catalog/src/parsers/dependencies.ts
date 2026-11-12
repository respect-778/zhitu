import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArtifactKind } from '../../contracts/artifacts.ts';
import { DocumentError } from './limits.ts';

interface PackageManifest { name: string; version: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
const modulesRoot = fileURLToPath(new URL('../../../../../node_modules/', import.meta.url));
const catalogManifest = fileURLToPath(new URL('../../package.json', import.meta.url));
const roots = { pdf: ['pdfjs-dist', '6.5.438'], xlsx: ['exceljs', '4.4.0'] } as const;
// The host npm workspace resolves 198 real XLSX dependency directories.
// Bound the complete closure while retaining per-package physical-path grants.
export const MAX_PARSER_DEPENDENCIES = 256;
function invalid(): never { throw new DocumentError('DOCUMENT_DEPENDENCY_REJECTED'); }
function insideModules(path: string): boolean {
  const remainder = relative(modulesRoot, path);
  return !!remainder && !remainder.startsWith('..') && !isAbsolute(remainder);
}
function manifestAt(path: string): PackageManifest {
  return JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as PackageManifest;
}

/** Resolve without executing package code, then reject workspace/file junctions and anything outside the physical npm tree. */
function resolvePackage(name: string, from: string): { directory: string; manifest: PackageManifest } {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name) || name.startsWith('@napi-rs/')) invalid();
  const require = createRequire(from);
  // package.json lookup also handles types-only packages, built-in-name packages and packages exporting only subpaths.
  const lookup = require.resolve.paths(`${name}/package.json`) ?? [];
  const candidate = lookup.map(path => join(path, name)).find(path => {
    try { return lstatSync(join(path, 'package.json')).isFile(); } catch { return false; }
  });
  if (!candidate || !insideModules(candidate)) invalid();
  const directory = realpathSync(candidate);
  const manifest = manifestAt(directory);
  if (directory !== candidate || manifest.name !== name) invalid();
  let cursor = candidate;
  while (cursor !== dirname(modulesRoot)) {
    if (lstatSync(cursor).isSymbolicLink()) invalid();
    const parent = dirname(cursor);
    if (parent === cursor) invalid();
    cursor = parent;
  }
  return { directory, manifest };
}

/** Fixed reviewed parser roots, bounded required-dependency closure, individual real-package grants. No @scope or node_modules parent grant. */
export function parserDependencyPaths(kind: ArtifactKind): string[] {
  try {
    const [name, version] = roots[kind];
    const root = resolvePackage(name, catalogManifest);
    if (root.manifest.version !== version) invalid();
    const pending = [root];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current.directory)) continue;
      visited.add(current.directory);
      if (visited.size > MAX_PARSER_DEPENDENCIES) invalid();
      for (const dependency of Object.keys(current.manifest.dependencies ?? {})) {
        if (Object.hasOwn(current.manifest.optionalDependencies ?? {}, dependency)) continue;
        if (/^(?:file|link|workspace|https?|git(?:\+[^:]+)?):/.test(current.manifest.dependencies![dependency])) invalid();
        pending.push(resolvePackage(dependency, join(current.directory, 'package.json')));
      }
    }
    return [...visited];
  } catch { invalid(); }
}

export function parserReadPaths(kind: ArtifactKind): string[] {
  return [
    new URL('./', import.meta.url), new URL('../../contracts/', import.meta.url),
    new URL('../../package.json', import.meta.url), new URL('../../../../../package.json', import.meta.url),
  ].map(url => fileURLToPath(url)).concat(parserDependencyPaths(kind));
}
