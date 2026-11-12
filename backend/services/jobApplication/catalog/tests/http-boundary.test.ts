import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { test } from 'node:test';
import { Agent, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { createControlledJsonGetter, createControlledJsonPoster, HttpBoundaryError, type HttpDependencies, type HttpPolicy } from '../src/http/controlled-get.ts';
import { isPublicIPv4 } from '../src/http/address-policy.ts';

const host = 'careers.tencent.com';
const target = `https://${host}/public?secret=DO_NOT_ECHO`;
interface ResponseSpec { status?: number; headers?: Record<string, string>; chunks?: Buffer[]; noHeaders?: boolean; noEnd?: boolean }
function mock(specs: ResponseSpec[] = [{}], overrides: { dns?: string[][]; peer?: string; trusted?: boolean; noConnect?: boolean } = {}) {
  const requested: RequestOptions[] = [];
  const connections: Parameters<HttpDependencies['connectTLS']>[0][] = [];
  const bodies: unknown[] = [];
  let resolutions = 0, writes = 0;
  const dependencies: HttpDependencies = {
    async resolveA() { return overrides.dns?.[resolutions++] ?? ['134.175.255.136']; },
    connectTLS(options) {
      connections.push(options);
      const socket = new PassThrough();
      Object.defineProperties(socket, { remoteAddress: { value: overrides.peer ?? options.host }, authorized: { value: overrides.trusted ?? true } });
      if (!overrides.noConnect) queueMicrotask(() => { socket.emit('connect'); if (!socket.destroyed) socket.emit('secureConnect'); });
      return socket as unknown as TLSSocket;
    },
    request(options, callback) {
      const index = requested.push(options) - 1;
      const request = new EventEmitter() as ClientRequest;
      let destroyed = false;
      request.destroy = () => { destroyed = true; return request; };
      request.end = ((body: unknown) => {
        const agent = options.agent as Agent;
        const immediateSocket = agent.createConnection(options, (_error, _socket) => {
          if (destroyed) return;
          writes++;
          bodies.push(body);
          const spec = specs[index] ?? specs.at(-1)!;
          if (spec.noHeaders) return;
          const response = (spec.noEnd ? new Readable({ read() {} }) : Readable.from(spec.chunks ?? [Buffer.from('{"ok":true}')])) as IncomingMessage;
          response.statusCode = spec.status ?? 200;
          response.headers = { 'content-type': 'application/json; charset=utf-8', ...spec.headers };
          callback(response);
        });
        assert.equal(immediateSocket, undefined, 'the HTTP socket is withheld until address + TLS checks succeed');
        return request;
      }) as ClientRequest['end'];
      return request;
    },
  };
  return { dependencies, requested, connections, bodies, writes: () => writes, resolutions: () => resolutions };
}
const policy: HttpPolicy = { allowedHosts: [host], totalTimeoutMs: 500, connectTimeoutMs: 100, readTimeoutMs: 100 };
function code(expected: string) { return (error: unknown) => error instanceof HttpBoundaryError && error.code === expected && !error.message.includes('DO_NOT_ECHO'); }

test('controlled GET binds the verified A address, sends only fixed public headers, and hands HTTP the socket after TLS verification', async () => {
  const fake = mock();
  const getter = createControlledJsonGetter(policy, fake.dependencies);
  assert.deepEqual(await getter(target), { ok: true });
  assert.equal(fake.writes(), 1); assert.equal(fake.connections.length, 1);
  const options = fake.connections[0];
  assert.equal(options.host, '134.175.255.136'); assert.equal(options.servername, host);
  assert.equal(options.port, 443); assert.equal(options.family, 4); assert.equal(options.autoSelectFamily, false);
  assert.equal(options.rejectUnauthorized, true); assert.ok(options.ca?.length); assert.equal(options.minVersion, 'TLSv1.2');
  assert.equal(options.checkServerIdentity, undefined);
  assert.deepEqual(fake.requested[0].headers, { accept: 'application/json', 'accept-encoding': 'identity', 'user-agent': 'KnowviaJobCatalog/0.1' });
  assert.deepEqual((fake.requested[0].agent as Agent).options.proxyEnv, {});
  assert.equal(fake.requested[0].insecureHTTPParser, false);
});

test('IP syntax and all blocked special-use ranges include mapped/IPv6, loopback, metadata, multicast and reserved space', () => {
  for (const address of ['0.1.2.3', '10.0.0.1', '100.64.1.1', '127.0.0.1', '169.254.169.254', '172.31.2.3', '192.0.0.9', '192.0.2.1',
    '192.31.196.1', '192.52.193.1', '192.175.48.1', '192.88.99.1', '192.168.2.3', '198.18.2.3', '198.51.100.1', '203.0.113.1',
    '224.0.0.1', '239.1.1.1', '240.0.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1', '2001:4860:4860::8888', '0177.0.0.1', '2130706433', '0x7f000001']) {
    assert.equal(isPublicIPv4(address), false, address);
  }
  assert.equal(isPublicIPv4('134.175.255.136'), true);
});

test('target allowlist rejects credentials, protocols, ports, hostname suffix tricks and encoded numeric addresses before resolving', async () => {
  const fake = mock();
  const getter = createControlledJsonGetter(policy, fake.dependencies);
  for (const url of ['http://careers.tencent.com/', 'https://user:password@careers.tencent.com/', 'https://careers.tencent.com:8443/',
    'https://careers.tencent.com.evil.invalid/', 'https://careers.tencent.com./', 'https://127.0.0.1/', 'https://2130706433/', 'https://0x7f000001/',
    'https://[::ffff:127.0.0.1]/', 'https://careers.tencent.com/#secret']) await assert.rejects(getter(url), code('HTTP_TARGET_DENIED'));
  assert.equal(fake.requested.length, 0); assert.equal(fake.resolutions(), 0);
});

test('every DNS answer and actual peer are checked; invalid TLS or a changed peer never receives HTTP GET', async () => {
  for (const dns of [[[]], [['127.0.0.1']], [['134.175.255.136', '169.254.169.254']], [['::ffff:134.175.255.136']]]) {
    const fake = mock([{}], { dns });
    await assert.rejects(createControlledJsonGetter(policy, fake.dependencies)(target), code('HTTP_ADDRESS_DENIED'));
    assert.equal(fake.connections.length, 0);
  }
  for (const [overrides, expected] of [[{ peer: '127.0.0.1' }, 'HTTP_CONNECTION_DENIED'], [{ peer: '8.8.8.8' }, 'HTTP_CONNECTION_DENIED'], [{ trusted: false }, 'HTTP_TLS_FAILED']] as const) {
    const fake = mock([{}], overrides);
    await assert.rejects(createControlledJsonGetter(policy, fake.dependencies)(target), code(expected));
    assert.equal(fake.writes(), 0);
  }
});

test('redirects revalidate host and DNS, drop cookies, enforce hop bounds and reject rebinding', async () => {
  const redirect = { status: 302, headers: { location: '/next', 'set-cookie': 'private=secret' } };
  const fake = mock([redirect, {}], { dns: [['134.175.255.136'], ['134.175.255.137']] });
  assert.deepEqual(await createControlledJsonGetter(policy, fake.dependencies)(target), { ok: true });
  assert.equal(fake.connections[1].host, '134.175.255.137');
  assert.ok(fake.requested.every(request => !JSON.stringify(request.headers).includes('private')));
  const rebind = mock([redirect], { dns: [['134.175.255.136'], ['127.0.0.1']] });
  await assert.rejects(createControlledJsonGetter(policy, rebind.dependencies)(target), code('HTTP_ADDRESS_DENIED'));
  assert.equal(rebind.writes(), 1);
  for (const location of ['http://careers.tencent.com/next', 'https://evil.invalid/', 'https://127.0.0.1/']) {
    const offsite = mock([{ status: 302, headers: { location } }]);
    await assert.rejects(createControlledJsonGetter(policy, offsite.dependencies)(target), code('HTTP_TARGET_DENIED'));
    assert.equal(offsite.writes(), 1);
  }
  const loop = mock([redirect]);
  await assert.rejects(createControlledJsonGetter({ ...policy, maxRedirects: 1 }, loop.dependencies)(target), code('HTTP_REDIRECT_LIMIT'));
  assert.equal(loop.writes(), 2);
});

test('status, media type, JSON/UTF8, compression and response byte limits fail closed', async () => {
  const cases: [ResponseSpec, string][] = [
    [{ status: 500 }, 'HTTP_STATUS_INVALID'], [{ headers: { 'content-type': 'text/html' } }, 'HTTP_CONTENT_TYPE_INVALID'],
    [{ headers: { 'content-encoding': 'gzip' } }, 'HTTP_ENCODING_DENIED'], [{ headers: { 'content-encoding': 'br' } }, 'HTTP_ENCODING_DENIED'],
    [{ headers: { 'content-length': '1001' } }, 'HTTP_BODY_LIMIT'], [{ chunks: [Buffer.alloc(600), Buffer.alloc(600)] }, 'HTTP_BODY_LIMIT'],
    [{ chunks: [Buffer.from('bad JSON DO_NOT_ECHO')] }, 'HTTP_JSON_INVALID'], [{ chunks: [Buffer.from([255])] }, 'HTTP_JSON_INVALID'],
  ];
  for (const [spec, expected] of cases) await assert.rejects(createControlledJsonGetter({ ...policy, maxBytes: 1000 }, mock([spec]).dependencies)(target), code(expected));
});

test('DNS, connection, TLS/header wait and stalled body each terminate within explicit deadlines', async () => {
  const dns = mock();
  let aborted = false;
  dns.dependencies.resolveA = async (_host, signal) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); });
  await assert.rejects(createControlledJsonGetter({ ...policy, totalTimeoutMs: 25 }, dns.dependencies)(target), code('HTTP_TOTAL_TIMEOUT'));
  assert.equal(aborted, true);
  const noConnect = mock([{}], { noConnect: true });
  await assert.rejects(createControlledJsonGetter({ ...policy, connectTimeoutMs: 25 }, noConnect.dependencies)(target), code('HTTP_CONNECT_TIMEOUT'));
  for (const spec of [{ noHeaders: true }, { noEnd: true }]) {
    await assert.rejects(createControlledJsonGetter({ ...policy, readTimeoutMs: 25 }, mock([spec]).dependencies)(target), code('HTTP_READ_TIMEOUT'));
  }
});

test('controlled JSON POST retains TLS and address checks, bounds public JSON before DNS and rejects every redirect', async () => {
  const fake = mock();
  const post = createControlledJsonPoster(policy, fake.dependencies);
  const body = JSON.stringify({ projectMappingIdList: [2, 104, 20], pageIndex: 1, pageSize: 100 });
  assert.deepEqual(await post(target, body), { ok: true });
  assert.equal(fake.requested[0].method, 'POST');
  assert.deepEqual(fake.bodies, [Buffer.from(body)]);
  assert.deepEqual(fake.requested[0].headers, { accept: 'application/json', 'accept-encoding': 'identity',
    'user-agent': 'KnowviaJobCatalog/0.1', 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) });
  const invalid = mock();
  const boundedPost = createControlledJsonPoster(policy, invalid.dependencies);
  for (const payload of ['[]', 'null', '{invalid}', JSON.stringify({ text: '字'.repeat(2000) })]) {
    await assert.rejects(boundedPost(target, payload), code('HTTP_REQUEST_BODY_INVALID'));
  }
  assert.equal(invalid.resolutions(), 0);
  for (const status of [301, 302, 303, 307, 308]) {
    const redirect = mock([{ status, headers: { location: '/next' } }]);
    await assert.rejects(createControlledJsonPoster(policy, redirect.dependencies)(target, body), code('HTTP_REDIRECT_DENIED'));
    assert.equal(redirect.writes(), 1);
  }
  const denied = mock([{}], { peer: '127.0.0.1' });
  await assert.rejects(createControlledJsonPoster(policy, denied.dependencies)(target, body), code('HTTP_CONNECTION_DENIED'));
  assert.equal(denied.writes(), 0); assert.deepEqual(denied.bodies, []);
});
