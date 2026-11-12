/** Small JSON-boundary validators. No coercion, defaults, I/O, or Node dependencies. */
export class ContractError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ContractError';
    this.path = path;
  }
}

export interface Schema<T> { parse(input: unknown, path?: string): T }
export type Infer<S extends Schema<unknown>> = ReturnType<S['parse']>;
type Shape = Record<string, Schema<unknown>>;
type ObjectValue<S extends Shape> = {
  [K in keyof S as undefined extends Infer<S[K]> ? never : K]: Infer<S[K]>
} & {
  [K in keyof S as undefined extends Infer<S[K]> ? K : never]?: Exclude<Infer<S[K]>, undefined>
};

export function ensure(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) throw new ContractError(path, message);
}
function schema<T>(read: (input: unknown, path: string) => T): Schema<T> {
  return { parse: (input, path = '$') => read(input, path) };
}
export function checked<T>(base: Schema<T>, check: (value: T, path: string) => void): Schema<T> {
  return schema((input, path) => { const value = base.parse(input, path); check(value, path); return value; });
}
export const text = schema<string>((input, path) => {
  ensure(typeof input === 'string' && input.trim().length > 0, path, 'expected a non-blank string');
  return input;
});
export const identifier = checked(text, (value, path) => {
  ensure(value === value.trim(), path, 'identifiers cannot have surrounding whitespace');
});
export const boolean = schema<boolean>((input, path) => {
  ensure(typeof input === 'boolean', path, 'expected a boolean'); return input;
});
export const nonnegative = schema<number>((input, path) => {
  ensure(typeof input === 'number' && Number.isFinite(input) && input >= 0, path, 'expected a finite nonnegative number');
  return input;
});
export const count = checked(nonnegative, (value, path) => {
  ensure(Number.isSafeInteger(value), path, 'expected a safe integer');
});
export function enumeration<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return schema((input, path) => {
    ensure(typeof input === 'string' && values.includes(input), path, `expected one of ${values.join(', ')}`);
    return input as T[number];
  });
}
export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return schema((input, path) => input === null ? null : inner.parse(input, path));
}
export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return schema((input, path) => input === undefined ? undefined : inner.parse(input, path));
}
export function array<T>(inner: Schema<T>, minimum = 0): Schema<T[]> {
  return schema((input, path) => {
    ensure(Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype, path, 'expected a plain JSON array');
    const descriptors = Object.getOwnPropertyDescriptors(input as object);
    const length = descriptors.length.value as number;
    const keys = Reflect.ownKeys(descriptors);
    ensure(keys.length === length + 1, path, 'expected a dense array without extra properties');
    for (const key of keys) {
      if (key === 'length') continue;
      ensure(typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < length,
        path, 'array properties must be element indices, without custom iterators');
      ensure('value' in descriptors[key] && descriptors[key].enumerable,
        `${path}[${key}]`, 'array elements must be enumerable data properties');
    }
    const result: T[] = [];
    for (let index = 0; index < length; index++) {
      result.push(inner.parse(descriptors[String(index)].value, `${path}[${index}]`));
    }
    ensure(result.length >= minimum, path, `expected an array with at least ${minimum} items`);
    return result;
  });
}
export function object<const S extends Shape>(shape: S): Schema<ObjectValue<S>> {
  return schema((input, path) => {
    ensure(input !== null && typeof input === 'object' && !Array.isArray(input), path, 'expected a plain object');
    const prototype = Object.getPrototypeOf(input);
    ensure(prototype === Object.prototype || prototype === null, path, 'expected a plain object');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of Reflect.ownKeys(input)) {
      ensure(typeof key === 'string' && Object.hasOwn(shape, key), path, 'unexpected field');
      ensure('value' in descriptors[key], `${path}.${key}`, 'accessors are not JSON data');
    }
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(shape)) {
      const value = field.parse(descriptors[key]?.value, `${path}.${key}`);
      if (value !== undefined) result[key] = value;
    }
    return result as ObjectValue<S>;
  });
}

export const httpUrl = checked(identifier, (value, path) => {
  ensure(/^https?:\/\//.test(value) && !/[\u0000-\u0020\u007f\\]/.test(value),
    path, 'expected an absolute HTTP(S) URL without whitespace, controls, or backslashes');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new ContractError(path, 'expected an absolute HTTP(S) URL'); }
  ensure(/^https?:$/.test(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password,
    path, 'expected an HTTP(S) URL without embedded credentials');
});
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function isInstant(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  return !!match && isDate(match[1]) && !/[+-]14:(?!00)/.test(value) && Number.isFinite(Date.parse(value));
}
export const instant = checked(text, (value, path) => {
  ensure(isInstant(value), path, 'expected a real RFC3339 timestamp with an explicit offset');
});
