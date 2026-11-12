import { JobSchema, type Job, type SourceConfig } from '../../contracts/index.ts';
import { assertTencentInternshipSource } from '../config/sources.ts';

export const TENCENT_INTERNSHIP_PARSER = 'tencent-internship-v1';
export const TENCENT_INTERNSHIP_LIST_API = 'https://join.qq.com/api/v1/position/searchPosition';
export const TENCENT_PROJECT_MAPPING_API = 'https://join.qq.com/api/v1/position/getProjectMapping';
export const INTERNSHIP_MAPPING_IDS = [2, 104, 20] as const;
const internshipProjects = new Set([2, 4, 12, 20]);

export class TencentInternshipParseError extends Error {
  constructor() { super('TENCENT_INTERNSHIP_RESPONSE_INVALID'); this.name = 'TencentInternshipParseError'; }
}
function fail(): never { throw new TencentInternshipParseError(); }
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
function data(input: unknown): unknown {
  const envelope = record(input);
  if (envelope.status !== 0) fail();
  return envelope.data;
}
export function internshipId(input: unknown): string {
  if (typeof input !== 'string' || !/^[1-9][0-9]{0,63}$/.test(input)) fail();
  return input;
}
export function internshipDetailUrl(id: string): string {
  return `https://join.qq.com/post_detail.html?postid=${internshipId(id)}`;
}
export function internshipDetailApiUrl(id: string): string {
  return `https://join.qq.com/api/v1/jobDetails/getJobDetailsByPostId?postId=${internshipId(id)}`;
}
export function internshipListBody(page: number): string {
  if (!Number.isSafeInteger(page) || page < 1 || page > 6) fail();
  return JSON.stringify({ projectIdList: [], projectMappingIdList: [...INTERNSHIP_MAPPING_IDS], keyword: '', bgList: [],
    workCountryType: 1, workCityList: [], recruitCityList: [], positionFidList: [], pageIndex: page, pageSize: 100 });
}

/** Recheck the official mapping on every collection run before trusting project IDs. */
export function readInternshipProjectMapping(input: unknown): void {
  const groups = data(input);
  if (!Array.isArray(groups) || groups.length > 100) fail();
  const mappings = new Map<number, Record<string, unknown>>();
  for (const group of groups) {
    const projects = record(group).subProjectList;
    if (!Array.isArray(projects) || projects.length > 100) fail();
    for (const raw of projects) {
      const project = record(raw);
      if (!INTERNSHIP_MAPPING_IDS.includes(project.mappingId as 2 | 104 | 20)) continue;
      if (mappings.has(project.mappingId as number)) fail();
      mappings.set(project.mappingId as number, project);
    }
  }
  for (const [id, projectId, projectName] of [[2, '2', '应届实习'], [104, '4,12', '日常实习'], [20, '20', '青云计划-实习生']] as const) {
    const project = mappings.get(id);
    if (!project || project.projectId !== projectId || project.projectName !== projectName || project.status !== 1) fail();
  }
}

export interface InternshipPost { id: string; title: string }
export function readInternshipList(input: unknown): { total: number; posts: unknown[] } {
  const value = record(data(input));
  if (!Number.isSafeInteger(value.count) || (value.count as number) < 0 || !Array.isArray(value.positionList) || value.positionList.length > 100) fail();
  return { total: value.count as number, posts: value.positionList };
}
export function readInternshipPost(input: unknown): InternshipPost | null {
  const post = record(input);
  // Negative IDs are generic category navigation, never individual jobs.
  if (typeof post.postId === 'string' && /^-[1-9][0-9]*$/.test(post.postId)) return null;
  return { id: internshipId(post.postId), title: text(post.positionTitle) };
}

const entities: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ',
  ndash: '–', mdash: '—', bull: '•', middot: '·', hellip: '…', copy: '©', reg: '®',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', le: '≤', ge: '≥',
};
const allowedTags = new Set('p div br li ul ol span b strong i em u a h1 h2 h3 h4 h5 h6 table tbody thead tr td th blockquote pre code font section article hr'.split(' '));
const lineTags = new Set('p div br li ul ol h1 h2 h3 h4 h5 h6 table tr blockquote pre section article hr'.split(' '));

/** Text-only parsing. Attributes are discarded and active/unknown elements fail closed. */
export function internshipPlainText(input: unknown): string {
  const raw = text(input);
  let output = '';
  for (let index = 0; index < raw.length; index++) {
    if (raw[index] !== '<' || !/[a-z/!]/i.test(raw[index + 1] ?? '')) { output += raw[index]; continue; }
    if (raw.startsWith('<!--', index)) {
      const end = raw.indexOf('-->', index + 4);
      if (end < 0) fail();
      index = end + 2; continue;
    }
    let quote: string | null = null;
    let end = index + 1;
    for (; end < raw.length; end++) {
      const char = raw[end];
      if (quote !== null) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
      else if (char === '<') fail();
    }
    if (end === raw.length) fail();
    const tag = /^<\/?([a-z][a-z0-9]*)(?=[\s/>])/i.exec(raw.slice(index, end + 1))?.[1].toLowerCase();
    if (!tag || !allowedTags.has(tag)) fail();
    if (lineTags.has(tag)) output += '\n';
    else if (tag === 'td' || tag === 'th') output += ' ';
    index = end;
  }
  output = output.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, token: string) => {
    if (!token.startsWith('#')) return entities[token.toLowerCase()] ?? whole;
    const point = Number.parseInt(token.slice(token[1].toLowerCase() === 'x' ? 2 : 1), token[1].toLowerCase() === 'x' ? 16 : 10);
    if (!Number.isSafeInteger(point) || point < 32 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) fail();
    return String.fromCodePoint(point);
  });
  return text(output.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[\t \u00a0]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim());
}
function optionalPlain(input: unknown): string | null {
  return input === undefined || input === null || (typeof input === 'string' && !input.trim()) ? null : internshipPlainText(input);
}
export function readInternshipDetail(input: unknown, post: InternshipPost, sourceInput: SourceConfig, observedAt: string): Job {
  const source = assertTencentInternshipSource(sourceInput);
  const detail = record(data(input));
  if (internshipId(detail.postId) !== post.id || detail.recruitType !== 2 || !internshipProjects.has(detail.projectId as number)) fail();
  const projectName = text(detail.projectName);
  if (!projectName.includes('实习')) fail();
  const qingyun = detail.projectId === 20;
  const responsibilitiesField = qingyun ? 'topicDetail' : 'desc';
  const requirementsField = qingyun ? 'topicRequirement' : 'request';
  const locations = detail.workCityList;
  if (!Array.isArray(locations) || !locations.length || locations.length > 100) fail();
  const detailUrl = internshipDetailUrl(post.id);
  return JobSchema.parse({
    sourceId: source.sourceId, sourceJobId: post.id, company: source.company, title: internshipPlainText(detail.title),
    employmentType: 'internship', recruitmentChannel: 'campus',
    responsibilities: internshipPlainText(detail[responsibilitiesField]), requirements: internshipPlainText(detail[requirementsField]),
    applicationInstructions: optionalPlain(detail.internBonus), sourceUrl: detailUrl, detailUrl, applyUrl: null, applicationMethod: 'unknown',
    locationRaw: locations.map(internshipPlainText).join('、'), educationRaw: null, salaryRaw: null,
    publishedAt: null, sourceUpdatedAt: null, deadlineAt: null,
    firstSeenAt: observedAt, lastSeenAt: observedAt, lastVerifiedAt: observedAt, closedAt: null,
    recruitmentStatus: 'open', verificationStatus: 'verified', visibility: 'hidden',
    evidence: [{ sourceUrl: internshipDetailApiUrl(post.id), observedAt, parserVersion: TENCENT_INTERNSHIP_PARSER,
      locator: `$.data;postId=${post.id};recruitType=2;projectId=${detail.projectId};projectName=${projectName};content=${responsibilitiesField},${requirementsField}` }],
  });
}
