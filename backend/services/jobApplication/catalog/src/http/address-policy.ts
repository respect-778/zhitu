import { isIP } from 'node:net';

// IPv4-only transport. Special-use ranges are deliberately overblocked; no
// IPv6, mapped address, numeric hostname or alternate IP syntax is accepted.
const denied: readonly [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.175.48.0', 24],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
function integer(address: string): number {
  return address.split('.').reduce((result, octet) => result * 256 + Number(octet), 0);
}
export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const value = integer(address);
  return !denied.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(integer(base) / 2 ** (32 - bits)));
}
