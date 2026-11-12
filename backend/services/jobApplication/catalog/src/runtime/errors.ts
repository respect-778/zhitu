import { RuntimeConfigError } from './config.ts';

/** Log only our fixed messages and allowlisted codes, never dependency messages, stack traces, or environment values. */
export function safeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof RuntimeConfigError) return { code: error.code, message: error.message };
  const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'EADDRINUSE') return { code, message: 'The API port is already in use; choose a different CATALOG_API_PORT.' };
  if (code === 'EACCES') return { code, message: 'The requested local resource is not accessible.' };
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
    return { code: 'DEPENDENCY_UNAVAILABLE', message: 'A required dependency is unavailable; complete the reviewed workspace installation.' };
  }
  return { code: 'RUNTIME_FAILED', message: 'Catalog execution failed. No successful collection or persistence is claimed.' };
}
