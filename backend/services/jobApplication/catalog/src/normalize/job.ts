import { JobSchema, SourceConfigSchema, type Job, type SourceConfig } from '../../contracts/index.ts';
import { assertMetadataSourceUrls, METADATA_PARSER } from '../config/internship-profiles.ts';
import { assertReviewedOfficialJob, hasReviewedSnapshot } from '../config/reviewed-official.ts';

export const MAX_INGEST_RECORDS = 1_000;
export type ReviewReason = 'MISSING_LOCATION' | 'UNSUPPORTED_MARKUP' | 'INVALID_TEXT_ENCODING' | 'EDUCATION_UNCERTAIN';
type MutableJob = { -readonly [Key in keyof Job]: Job[Key] };
export class NormalizeError extends Error {
  readonly code: 'INVALID_JOB' | 'SOURCE_MISMATCH' | 'SOURCE_URL_INVALID';
  constructor(code: NormalizeError['code']) { super(code); this.name = 'NormalizeError'; this.code = code; }
}

// Small, deliberately exact mainland city vocabulary. Unknown/overseas names stay raw.
const cityCodes: Readonly<Record<string, string>> = {
  北京: '110000', 上海: '310000', 深圳: '440300', 深圳总部: '440300', 广州: '440100', 成都: '510100',
  杭州: '330100', 武汉: '420100', 西安: '610100', 南京: '320100', 苏州: '320500',
  天津: '120000', 重庆: '500000', 长沙: '430100', 合肥: '340100', 厦门: '350200',
};
function cleanText(value: string): string {
  return value.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[\t \u00a0\u3000]+/g, ' ').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function cities(raw: string | null): string[] | undefined {
  if (raw === null) return undefined;
  const parts = raw.split(/[,，、/;；]/).map(value => value.trim().replace(/市$/, ''));
  const codes = parts.map(value => Object.hasOwn(cityCodes, value) ? cityCodes[value] : undefined);
  return codes.every((value): value is string => value !== undefined) ? [...new Set(codes)] : undefined;
}
const degreeNames: Readonly<Record<string, NonNullable<Job['minimumDegree']>>> = { 高中: 'secondary', 中专: 'secondary', 大专: 'associate', 专科: 'associate', 本科: 'bachelor', 学士: 'bachelor', 硕士: 'master', 博士: 'doctorate' };
const educationMention = /高中|中专|大专|专科|本科|学士|硕士|博士|学历|学位/;
const educationException = /不限|不要求|无需|不需要|替代|放宽|同等|并非|非必须|亦可|也可|即可|酌情|不限制|无硬性/;
function educationContext(value: string): boolean {
  return educationMention.test(value) || educationException.test(value) || /^(?:\s*\d+[.、．)]\s*)?或/.test(value);
}
function degree(raw: string | null): Job['minimumDegree'] {
  if (raw === null) return undefined;
  const value = raw.trim().replace(/[\t \u3000]+/g, '');
  if (/^(?:学历不限|不限学历|不限)$/.test(value)) return 'none';
  const exact = /^(?:(?:最低学历|学历要求|学历)[:：]?)?(高中|中专|大专|专科|本科|学士|硕士|博士)(?:及以上|以上)?(?:学历|学位)?$/.exec(value);
  if (exact) return degreeNames[exact[1]];
  if (/[\r\n]/.test(value) || /优先/.test(value) || educationException.test(value)) return undefined;
  const clauses = value.split(/[，,；;。]/).filter(educationContext);
  if (clauses.length !== 1) return undefined;
  const clause = clauses[0].replace(/^\d+[.、．)]/, '');
  const hard = /^(高中|中专|大专|专科|本科|学士|硕士|博士)(?:及以上|以上)?(?:学历|学位)$/.exec(clause);
  return hard ? degreeNames[hard[1]] : undefined;
}

function extractTencentEducation(job: MutableJob): void {
  if (job.educationRaw !== null || job.requirements === null || !educationMention.test(job.requirements)) return;
  const entries = job.requirements.split(/\r\n|\r|\n/).map((raw, index) => ({ raw, index }))
    .filter(({ raw }) => educationContext(raw));
  if (!entries.length) return;
  // Multiple independent qualification statements are ambiguous even if one individually looks simple.
  job.educationRaw = entries.map(entry => entry.raw).join('\n');
  const origin = job.evidence[0];
  job.evidence.push({ sourceUrl: origin.sourceUrl, observedAt: origin.observedAt, parserVersion: 'tencent-education-v1',
    locator: `$.Data.Requirement;entries=${entries.map(entry => entry.index + 1).join(',')}` });
}

/** Single forward scan; quoted '<' stays inside its tag, and an unquoted '<' starts a new candidate. */
function containsMarkup(value: string): boolean {
  let inTag = false;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '<' && quote === null) {
      if (value.startsWith('<!--', index) || value.slice(index, index + 9).toLowerCase() === '<!doctype') return true;
      const code = value.charCodeAt(index + (value[index + 1] === '/' ? 2 : 1));
      inTag = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    } else if (inTag) {
      if (char === '>') return true;
      if (quote !== null) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
    }
  }
  return false;
}

/** Shared assessment of the final fields, including old values retained by a partial merge. */
export function jobReviewReasons(job: Job): ReviewReason[] {
  const reasons = new Set<ReviewReason>();
  const texts = [job.company, job.title, job.responsibilities, job.requirements, job.applicationInstructions,
    job.locationRaw, job.educationRaw, job.salaryRaw, ...Object.values(job.reviewedMetadata ?? {})].filter((value): value is string => typeof value === 'string');
  if (texts.some(value => /\uFFFD|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]/u.test(value))) reasons.add('INVALID_TEXT_ENCODING');
  // Detect only; keep literal source text, including mathematical '<x' and unsupported markup, unchanged.
  if (texts.some(containsMarkup)) reasons.add('UNSUPPORTED_MARKUP');
  if (job.educationRaw !== null && job.minimumDegree === undefined && !hasReviewedSnapshot(job)) reasons.add('EDUCATION_UNCERTAIN');
  if (job.locationRaw === null) reasons.add('MISSING_LOCATION');
  return [...reasons];
}
function salary(raw: string | null): Job['salary'] {
  if (raw === null) return undefined;
  // No annualisation, exchange conversion, bonuses, number-of-month assumptions or "negotiable" zero.
  // Peel distinct tokens before parsing numbers: optional currencies cannot compete for the same whitespace run.
  const value = raw.trim();
  const unit = /(?:\/|每)(小时|时|天|日|月|年)$/.exec(value);
  if (!unit) return undefined;
  let amount = value.slice(0, unit.index).trim();
  const prefixToken = /^(CNY|USD|EUR|人民币|美元|欧元|¥|￥|\$)/.exec(amount)?.[0];
  if (prefixToken) amount = amount.slice(prefixToken.length).trimStart();
  const suffixToken = /(美元|欧元|元)$/.exec(amount)?.[0];
  if (suffixToken) amount = amount.slice(0, -suffixToken.length).trimEnd();
  const currencies: Record<string, string> = { CNY: 'CNY', USD: 'USD', EUR: 'EUR', 人民币: 'CNY', 美元: 'USD', 欧元: 'EUR', '¥': 'CNY', '￥': 'CNY', '$': 'USD', 元: 'CNY' };
  const prefix = prefixToken ? currencies[prefixToken] : undefined;
  const suffix = suffixToken ? currencies[suffixToken] : undefined;
  if ((!prefix && !suffix) || (prefix && suffix && prefix !== suffix)) return undefined;
  // Digits, decimal dots, range markers and whitespace occupy disjoint positions; no adjacent unbounded whitespace groups.
  const bounds = /^(\d+(?:\.\d+)?)(?:\s*[-~–至]\s*(\d+(?:\.\d+)?))?$/.exec(amount);
  if (!bounds) return undefined;
  const min = Number(bounds[1]), max = Number(bounds[2] ?? bounds[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return undefined;
  const periods: Readonly<Record<string, NonNullable<Job['salary']>['period']>> = { 小时: 'hour', 时: 'hour', 天: 'day', 日: 'day', 月: 'month', 年: 'year' };
  const period = periods[unit[1]];
  return { min, max, currency: prefix ?? suffix!, period };
}

export function assertSourceUrls(job: Job, source: SourceConfig): void {
  if (job.reviewedMetadata && source.adapter !== 'reviewed-official') throw new NormalizeError('SOURCE_MISMATCH');
  if (source.adapter === 'reviewed-official') {
    try { assertReviewedOfficialJob(job, source); }
    catch { throw new NormalizeError('SOURCE_MISMATCH'); }
  }
  if (source.adapter === 'internship-metadata') {
    try { assertMetadataSourceUrls(job, source); }
    catch { throw new NormalizeError('SOURCE_URL_INVALID'); }
  }
  const urls = [job.sourceUrl, job.detailUrl, job.applyUrl, ...job.evidence.map(item => item.sourceUrl)].filter((value): value is string => value !== null);
  for (const value of urls) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || !source.allowedHosts.includes(url.hostname)) throw new NormalizeError('SOURCE_URL_INVALID');
  }
  if (source.adapter === 'tencent') {
    if (!/^[0-9]{1,64}$/.test(job.sourceJobId)) throw new NormalizeError('INVALID_JOB');
    const base = 'https://careers.tencent.com';
    const detail = `${base}/jobdesc.html?postId=${job.sourceJobId}`;
    const evidence = `${base}/tencentcareer/api/post/ByPostId?postId=${job.sourceJobId}&language=zh-cn`;
    if (job.sourceUrl !== detail || job.detailUrl !== detail || job.applyUrl !== null || job.evidence.some(item => item.sourceUrl !== evidence)) {
      throw new NormalizeError('SOURCE_URL_INVALID');
    }
  }
  if (source.adapter === 'tencent-internship') {
    if (source.sourceId !== 'tencent-internship' || source.scopeKey !== 'tencent:campus:internship:cn' ||
        source.kind !== 'enterprise' || source.company !== '腾讯' || source.recruitmentChannel !== 'campus' ||
        source.entryUrl !== 'https://join.qq.com/' || source.allowedHosts.length !== 1 || source.allowedHosts[0] !== 'join.qq.com' ||
        !/^[1-9][0-9]{0,63}$/.test(job.sourceJobId) || job.employmentType !== 'internship' || job.recruitmentChannel !== 'campus') {
      throw new NormalizeError('SOURCE_MISMATCH');
    }
    const detail = `https://join.qq.com/post_detail.html?postid=${job.sourceJobId}`;
    const evidence = `https://join.qq.com/api/v1/jobDetails/getJobDetailsByPostId?postId=${job.sourceJobId}`;
    if (job.sourceUrl !== detail || job.detailUrl !== detail || job.applyUrl !== null || job.applicationMethod !== 'unknown' ||
        job.evidence.some(item => item.sourceUrl !== evidence &&
          !(item.sourceUrl === 'https://join.qq.com/api/v1/position/searchPosition' && item.parserVersion === METADATA_PARSER &&
            /^\$\.data\.positionList;projectId=(?:2|4|12|20);workCountryType=1$/.test(item.locator ?? '')))) throw new NormalizeError('SOURCE_URL_INVALID');
  }
}

/** JSON/contract boundary first; raw source fields are never rewritten or filled from collection time. */
export function normalizeJob(input: unknown, sourceInput: SourceConfig): { job: Job; reviewReasons: ReviewReason[] } {
  const source = SourceConfigSchema.parse(sourceInput);
  let job: MutableJob;
  try {
    // Empty optional text is a missing observation. Validate descriptors before making any copy.
    if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new NormalizeError('INVALID_JOB');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !('value' in descriptors[key]))) throw new NormalizeError('INVALID_JOB');
    const prepared = { ...input } as Record<string, unknown>;
    for (const key of ['responsibilities', 'requirements', 'applicationInstructions', 'locationRaw', 'educationRaw', 'salaryRaw']) {
      if (typeof prepared[key] === 'string' && !prepared[key].trim()) prepared[key] = null;
    }
    job = JobSchema.parse(prepared);
  } catch { throw new NormalizeError('INVALID_JOB'); }
  if (job.sourceId !== source.sourceId || (source.recruitmentChannel !== 'unknown' && job.recruitmentChannel !== source.recruitmentChannel)) {
    throw new NormalizeError('SOURCE_MISMATCH');
  }
  if (JSON.stringify(job).length > 1_000_000 || job.evidence.length > 64 || job.sourceJobId.length > 128) throw new NormalizeError('INVALID_JOB');
  assertSourceUrls(job, source);
  if (source.adapter === 'tencent') extractTencentEducation(job);
  const originalTextIssues = jobReviewReasons(job).filter(reason => reason === 'INVALID_TEXT_ENCODING' || reason === 'UNSUPPORTED_MARKUP');
  for (const key of ['company', 'title', 'responsibilities', 'requirements', 'applicationInstructions'] as const) {
    const value = job[key];
    if (value !== null) job[key] = cleanText(value);
  }
  job.cityCodes = cities(job.locationRaw);
  job.minimumDegree = degree(job.educationRaw);
  job.salary = salary(job.salaryRaw);
  const reviewReasons = [...new Set([...originalTextIssues, ...jobReviewReasons(job)])];
  // This boundary never publishes. Unknown salary/dates/employment are legitimate, not invented defaults.
  job.visibility = reviewReasons.length || job.visibility === 'review' ? 'review' : 'hidden';
  try { return { job: JobSchema.parse(job), reviewReasons }; }
  catch { throw new NormalizeError('INVALID_JOB'); }
}
