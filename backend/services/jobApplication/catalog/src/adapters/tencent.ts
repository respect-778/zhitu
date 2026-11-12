// Adapted from freehire internal/ingest/sources/tencent.go at
// 4ac57f6902788f6e5982ddc4f91ab9855d946b5a (MIT; see licenses/freehire-LICENSE).
import { JobSchema, SourceDateSchema, type Job, type SourceConfig, type SourceDate } from '../../contracts/index.ts';

export const TENCENT_PARSER = 'tencent-native-v1';
export const TENCENT_EXCLUSION = 'tencent-native-source-id-v1';
const base = 'https://careers.tencent.com';
export class TencentParseError extends Error {
  constructor() { super('TENCENT_RESPONSE_INVALID'); this.name = 'TencentParseError'; }
}
function fail(): never { throw new TencentParseError(); }
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !('value' in descriptors[key]))) fail();
  return input as Record<string, unknown>;
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 300000) fail();
  return input;
}
function optionalText(input: unknown): string | null {
  return input === undefined || input === null || input === '' ? null : text(input);
}
export function tencentId(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9]{1,64}$/.test(input)) fail();
  return input;
}
export function tencentDetailUrl(id: string): string { return `${base}/jobdesc.html?postId=${tencentId(id)}`; }
export function tencentListUrl(page: number, pageSize: number): string {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) fail();
  const url = new URL('/tencentcareer/api/post/Query', base);
  url.search = new URLSearchParams({ pageIndex: String(page), pageSize: String(pageSize), language: 'zh-cn' }).toString();
  return url.href;
}
export function tencentDetailApiUrl(id: string): string {
  return `${base}/tencentcareer/api/post/ByPostId?${new URLSearchParams({ postId: tencentId(id), language: 'zh-cn' })}`;
}
function data(input: unknown): Record<string, unknown> {
  const envelope = record(input);
  if (envelope.Code !== 200) fail();
  return record(envelope.Data);
}
export function readTencentList(input: unknown, pageSize: number): { total: number; posts: unknown[] } {
  const value = data(input);
  if (!Number.isSafeInteger(value.Count) || (value.Count as number) < 0 || !Array.isArray(value.Posts) || value.Posts.length > pageSize) fail();
  return { total: value.Count as number, posts: value.Posts };
}
export interface TencentPost { id: string; title: string; location: string | null; updated: string | null; source: 1 | 4 }
export function postIdentity(input: unknown): string { return tencentId(record(input).PostId); }
export function readTencentPost(input: unknown): TencentPost {
  const post = record(input);
  const id = tencentId(post.PostId);
  const title = text(post.RecruitPostName);
  if ((post.SourceID !== 1 && post.SourceID !== 4) || post.IsValid !== true) fail();
  return { id, title, source: post.SourceID, location: optionalText(post.LocationName), updated: optionalText(post.LastUpdateTime) };
}
function sourceDate(raw: string | null): SourceDate | null {
  if (raw === null) return null;
  const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(raw.trim());
  const value = match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
  try { return SourceDateSchema.parse({ raw, value, precision: value ? 'day' : null, timezone: null }); }
  catch { return SourceDateSchema.parse({ raw, value: null, precision: null, timezone: null }); }
}
export function readTencentDetail(input: unknown, post: TencentPost, source: SourceConfig, observedAt: string): Job {
  const detail = data(input);
  if (tencentId(detail.PostId) !== post.id || detail.SourceID !== 1 || (detail.IsValid !== undefined && detail.IsValid !== true)) fail();
  const detailUrl = tencentDetailUrl(post.id);
  return JobSchema.parse({
    sourceId: source.sourceId, sourceJobId: post.id, company: source.company, title: text(detail.RecruitPostName),
    employmentType: 'unknown', recruitmentChannel: source.recruitmentChannel,
    responsibilities: text(detail.Responsibility), requirements: text(detail.Requirement), applicationInstructions: null,
    sourceUrl: detailUrl, detailUrl, applyUrl: null, applicationMethod: 'unknown',
    locationRaw: optionalText(detail.LocationName) ?? post.location, educationRaw: null, salaryRaw: null,
    publishedAt: null, sourceUpdatedAt: sourceDate(optionalText(detail.LastUpdateTime) ?? post.updated), deadlineAt: null,
    firstSeenAt: observedAt, lastSeenAt: observedAt, lastVerifiedAt: observedAt, closedAt: null,
    recruitmentStatus: 'open', verificationStatus: 'verified', visibility: 'hidden',
    evidence: [{ sourceUrl: tencentDetailApiUrl(post.id), observedAt, parserVersion: TENCENT_PARSER,
      locator: '$.Data.PostId,SourceID,RecruitPostName,Responsibility,Requirement,LocationName,LastUpdateTime' }],
  });
}
