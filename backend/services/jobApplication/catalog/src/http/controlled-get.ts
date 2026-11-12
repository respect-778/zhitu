import { Resolver } from 'node:dns/promises';
import { Agent, request as httpsRequest, type RequestOptions } from 'node:https';
import { isIP, type TcpNetConnectOpts } from 'node:net';
import { connect as tlsConnect, rootCertificates, type TLSSocket, type ConnectionOptions } from 'node:tls';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { isPublicIPv4 } from './address-policy.ts';
import { assertSafeNetworkEnvironment } from './environment.ts';

export class HttpBoundaryError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'HttpBoundaryError'; this.code = code; }
}
export type JsonGetter = (url: string) => Promise<unknown>;
export type JsonPoster = (url: string, serializedBody: string) => Promise<unknown>;
export interface HttpPolicy {
  allowedHosts: readonly string[];
  maxBytes?: number;
  totalTimeoutMs?: number;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  maxRedirects?: number;
}
// Injection is for isolated tests only. The CLI never accepts these capabilities.
export interface HttpDependencies {
  resolveA: (host: string, signal: AbortSignal) => Promise<string[]>;
  request: (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
  connectTLS: (options: ConnectionOptions & TcpNetConnectOpts) => TLSSocket;
}
async function resolveA(host: string, signal: AbortSignal): Promise<string[]> {
  const resolver = new Resolver({ timeout: 3000, tries: 1 });
  const cancel = () => resolver.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try { return await resolver.resolve4(host); }
  finally { signal.removeEventListener('abort', cancel); }
}
const defaults: HttpDependencies = { resolveA, request: httpsRequest, connectTLS: tlsConnect };
function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new HttpBoundaryError('HTTP_POLICY_INVALID');
  return result;
}
export function createControlledJsonGetter(policy: HttpPolicy, dependencies: HttpDependencies = defaults): JsonGetter {
  return createControlledJsonRequester(policy, dependencies, 'GET');
}
/** Public JSON only. Bodies are bounded before DNS, and POST redirects are rejected. */
export function createControlledJsonPoster(policy: HttpPolicy, dependencies: HttpDependencies = defaults): JsonPoster {
  return createControlledJsonRequester(policy, dependencies, 'POST');
}
function createControlledJsonRequester(policy: HttpPolicy, dependencies: HttpDependencies, method: 'GET' | 'POST') {
  if (dependencies === defaults) assertSafeNetworkEnvironment();
  const hosts = [...policy.allowedHosts];
  if (!hosts.length || hosts.some(host => host.length > 253 || isIP(host) !== 0 ||
      !host.includes('.') || !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)))) {
    throw new HttpBoundaryError('HTTP_POLICY_INVALID');
  }
  const maxBytes = bounded(policy.maxBytes, 2 * 1024 * 1024, 8 * 1024 * 1024);
  const totalTimeout = bounded(policy.totalTimeoutMs, 15000, 60000);
  const connectTimeout = bounded(policy.connectTimeoutMs, 5000, 30000);
  const readTimeout = bounded(policy.readTimeoutMs, 5000, 30000);
  const maxRedirects = policy.maxRedirects ?? 3;
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5) throw new HttpBoundaryError('HTTP_POLICY_INVALID');
  function checkedUrl(raw: string): URL {
    let url: URL;
    try { url = new URL(raw); } catch { throw new HttpBoundaryError('HTTP_TARGET_DENIED'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        isIP(url.hostname) !== 0 || !hosts.includes(url.hostname)) throw new HttpBoundaryError('HTTP_TARGET_DENIED');
    return url;
  }
  return async (input: string, serializedBody?: string): Promise<unknown> => {
    let payload: Buffer | undefined;
    if (method === 'POST') {
      if (typeof serializedBody !== 'string' || Buffer.byteLength(serializedBody, 'utf8') > 4096) throw new HttpBoundaryError('HTTP_REQUEST_BODY_INVALID');
      try {
        const parsed: unknown = JSON.parse(serializedBody);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      } catch { throw new HttpBoundaryError('HTTP_REQUEST_BODY_INVALID'); }
      payload = Buffer.from(serializedBody, 'utf8');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), totalTimeout);
    try {
      let url = checkedUrl(input);
      for (let redirects = 0; ; redirects++) {
        if (controller.signal.aborted) throw new HttpBoundaryError('HTTP_TOTAL_TIMEOUT');
        const addresses = await Promise.race([
          dependencies.resolveA(url.hostname, controller.signal),
          new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new HttpBoundaryError('HTTP_TOTAL_TIMEOUT')), { once: true })),
        ]);
        if (controller.signal.aborted) throw new HttpBoundaryError('HTTP_TOTAL_TIMEOUT');
        if (!addresses.length || addresses.some(address => !isPublicIPv4(address))) throw new HttpBoundaryError('HTTP_ADDRESS_DENIED');
        const address = addresses[0];
        const result = await new Promise<{ body?: Buffer; location?: string }>((resolve, reject) => {
          let settled = false;
          let connectTimer: NodeJS.Timeout | undefined;
          let readTimer: NodeJS.Timeout | undefined;
          let request: ClientRequest | undefined;
          let response: IncomingMessage | undefined;
          let tls: TLSSocket | undefined;
          const agent = new Agent({ keepAlive: false, maxSockets: 1, maxCachedSessions: 0, proxyEnv: {} });
          const finish = (error?: HttpBoundaryError, value?: { body?: Buffer; location?: string }) => {
            if (settled) return;
            settled = true;
            clearTimeout(connectTimer); clearTimeout(readTimer);
            controller.signal.removeEventListener('abort', abort);
            if (error) { response?.destroy(); tls?.destroy(); request?.destroy(); reject(error); }
            else resolve(value!);
            agent.destroy();
          };
          const abort = () => finish(new HttpBoundaryError('HTTP_TOTAL_TIMEOUT'));
          const resetRead = () => {
            clearTimeout(readTimer);
            readTimer = setTimeout(() => finish(new HttpBoundaryError('HTTP_READ_TIMEOUT')), readTimeout);
          };
          controller.signal.addEventListener('abort', abort, { once: true });
          // Node's Agent waits for this callback when createConnection returns
          // undefined. The HTTP client receives no socket (and cannot write GET)
          // until both the actual peer address and TLS identity are validated.
          agent.createConnection = (_options: RequestOptions, callback?: (error: Error | null, socket: Duplex) => void) => {
            tls = dependencies.connectTLS({
              host: address, port: 443, servername: url.hostname, family: 4, autoSelectFamily: false,
              rejectUnauthorized: true, ca: [...rootCertificates], minVersion: 'TLSv1.2',
            });
            const socket = tls;
            const checkAddress = () => {
              if (socket.remoteAddress !== address || !isPublicIPv4(socket.remoteAddress)) {
                finish(new HttpBoundaryError('HTTP_CONNECTION_DENIED')); return false;
              }
              return true;
            };
            socket.once('connect', checkAddress);
            socket.once('error', () => finish(new HttpBoundaryError('HTTP_TLS_FAILED')));
            socket.once('secureConnect', () => {
              if (settled || !checkAddress()) return;
              if (!socket.authorized) { finish(new HttpBoundaryError('HTTP_TLS_FAILED')); return; }
              clearTimeout(connectTimer); resetRead();
              callback?.(null, socket);
            });
            return undefined;
          };
          const options: RequestOptions = {
            protocol: 'https:', hostname: url.hostname, port: 443, method,
            path: url.pathname + url.search, servername: url.hostname,
            family: 4, agent,
            // Pin DNS to this validated result; never resolve again inside the socket.
            lookup: (_hostname, _options, callback) => callback(null, address, 4),
            rejectUnauthorized: true, ca: [...rootCertificates], minVersion: 'TLSv1.2',
            insecureHTTPParser: false, maxHeaderSize: 16384,
            headers: { accept: 'application/json', 'accept-encoding': 'identity', 'user-agent': 'KnowviaJobCatalog/0.1',
              ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}) },
          };
          try {
            request = dependencies.request(options, incoming => {
              response = incoming;
              if (settled) { incoming.destroy(); return; }
              clearTimeout(connectTimer);
              resetRead();
              const encoding = incoming.headers['content-encoding'];
              if (encoding !== undefined && encoding.trim().toLowerCase() !== 'identity') {
                finish(new HttpBoundaryError('HTTP_ENCODING_DENIED')); return;
              }
              const status = incoming.statusCode ?? 0;
              if ([301, 302, 303, 307, 308].includes(status)) {
                if (method === 'POST') { finish(new HttpBoundaryError('HTTP_REDIRECT_DENIED')); return; }
                const location = incoming.headers.location;
                if (!location) { finish(new HttpBoundaryError('HTTP_REDIRECT_INVALID')); return; }
                incoming.destroy(); request?.destroy(); finish(undefined, { location }); return;
              }
              if (status !== 200) { finish(new HttpBoundaryError('HTTP_STATUS_INVALID')); return; }
              if (!/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i.test(incoming.headers['content-type'] ?? '')) {
                finish(new HttpBoundaryError('HTTP_CONTENT_TYPE_INVALID')); return;
              }
              const length = incoming.headers['content-length'];
              if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
                finish(new HttpBoundaryError('HTTP_BODY_LIMIT')); return;
              }
              const chunks: Buffer[] = [];
              let size = 0;
              incoming.on('data', (chunk: Buffer) => {
                if (settled) return;
                size += chunk.length;
                if (size > maxBytes) { finish(new HttpBoundaryError('HTTP_BODY_LIMIT')); return; }
                chunks.push(chunk); resetRead();
              });
              incoming.once('end', () => finish(undefined, { body: Buffer.concat(chunks, size) }));
              incoming.once('error', () => finish(new HttpBoundaryError('HTTP_RESPONSE_FAILED')));
              incoming.once('aborted', () => finish(new HttpBoundaryError('HTTP_RESPONSE_FAILED')));
            });
            request.once('error', () => finish(new HttpBoundaryError('HTTP_REQUEST_FAILED')));
            connectTimer = setTimeout(() => finish(new HttpBoundaryError('HTTP_CONNECT_TIMEOUT')), connectTimeout);
            request.end(payload);
          } catch { finish(new HttpBoundaryError('HTTP_REQUEST_FAILED')); }
        });
        if (result.location !== undefined) {
          if (redirects >= maxRedirects) throw new HttpBoundaryError('HTTP_REDIRECT_LIMIT');
          try { url = checkedUrl(new URL(result.location, url).href); }
          catch { throw new HttpBoundaryError('HTTP_TARGET_DENIED'); }
          continue;
        }
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.body)); }
        catch { throw new HttpBoundaryError('HTTP_JSON_INVALID'); }
      }
    } catch (error) {
      if (error instanceof HttpBoundaryError) throw error;
      throw new HttpBoundaryError(controller.signal.aborted ? 'HTTP_TOTAL_TIMEOUT' : 'HTTP_DNS_FAILED');
    } finally { clearTimeout(timer); }
  };
}
