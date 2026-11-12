import { RuntimeConfigError } from '../runtime/config.ts';

/** This post-start guard cannot undo Node startup preloads; use a clean launcher. */
export function assertSafeNetworkEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const forbidden = /^(NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|NODE_USE_ENV_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|SSLKEYLOGFILE|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i;
  if (Object.keys(env).some(name => forbidden.test(name))) {
    throw new RuntimeConfigError('AMBIENT_NETWORK_CONFIG', 'Live verification requires a clean TLS, proxy and Node startup environment.');
  }
}
