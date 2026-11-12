import type { CatalogSearchQuery } from '../../contracts/index.ts';

export class InvalidCatalogRequest extends Error {
  constructor() { super('INVALID_REQUEST'); this.name = 'InvalidCatalogRequest'; }
}
const keys = new Set(['q', 'city', 'degree', 'employmentType', 'recruitmentChannel', 'sourceKind', 'sourceId', 'page', 'pageSize']);

/** Parse the raw query so duplicate keys and invalid percent/UTF-8 sequences cannot be silently coerced. */
function parameters(url: string): Map<string, string> {
  const raw = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  if (raw.length > 4096) throw new InvalidCatalogRequest();
  const result = new Map<string, string>();
  if (!raw) return result;
  try {
    for (const entry of raw.split('&')) {
      const equals = entry.indexOf('=');
      if (equals < 1) throw new InvalidCatalogRequest();
      const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, ' '));
      const key = decode(entry.slice(0, equals)), value = decode(entry.slice(equals + 1));
      if (result.has(key) || !keys.has(key) || !value || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new InvalidCatalogRequest();
      result.set(key, value);
    }
  } catch { throw new InvalidCatalogRequest(); }
  return result;
}
function member<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new InvalidCatalogRequest();
  return value as T;
}
function integer(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new InvalidCatalogRequest();
  return Number(value);
}
export function parseSearchQuery(url: string): CatalogSearchQuery {
  const values = parameters(url), q = values.get('q'), city = values.get('city'), sourceId = values.get('sourceId');
  if ((q !== undefined && [...q].length > 120) || (city !== undefined && !/^[0-9]{6}$/.test(city)) ||
      (sourceId !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(sourceId))) throw new InvalidCatalogRequest();
  return {
    q, city, sourceId,
    degree: member(values.get('degree'), ['none', 'secondary', 'associate', 'bachelor', 'master', 'doctorate', 'unknown']),
    employmentType: member(values.get('employmentType'), ['internship', 'full_time', 'part_time', 'unknown']),
    recruitmentChannel: member(values.get('recruitmentChannel'), ['campus', 'social', 'unknown']),
    sourceKind: member(values.get('sourceKind'), ['enterprise', 'announcement']),
    page: integer(values.get('page'), 1, 10_000), pageSize: integer(values.get('pageSize'), 20, 50),
  };
}
export function assertNoQuery(url: string): void {
  if (parameters(url).size) throw new InvalidCatalogRequest();
}
