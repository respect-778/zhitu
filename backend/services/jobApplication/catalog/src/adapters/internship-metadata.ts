import { isDeepStrictEqual } from 'node:util';
import { JobSchema, SourceDateSchema, type Job, type SourceConfig, type SourceDate } from '../../contracts/index.ts';
import { array, boolean, count, enumeration, identifier, instant, nullable, object, optional, text, type Infer } from '../../contracts/validation.ts';
import { internshipProfile, assertMetadataSource, isBoschListingUrl, METADATA_PARSER } from '../config/internship-profiles.ts';
import { assertTencentInternshipSource } from '../config/sources.ts';
import { readInternshipProjectMapping } from './tencent-internship.ts';

export class MetadataParseError extends Error {
  readonly code: 'METADATA_INVALID' | 'OUTSIDE_SCOPE';
  constructor(code: MetadataParseError['code'] = 'METADATA_INVALID') { super(code); this.name = 'MetadataParseError'; this.code = code; }
}
function fail(): never { throw new MetadataParseError(); }
function outside(): never { throw new MetadataParseError('OUTSIDE_SCOPE'); }
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !('value' in descriptors[key]))) fail();
  return input as Record<string, unknown>;
}
function plainText(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 10000) fail();
  return input.trim();
}
function stringId(input: unknown): string {
  const id = plainText(input);
  if (!/^[1-9][0-9]{0,63}$/.test(id)) fail();
  return id;
}
function textList(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) fail();
  return input.map(plainText);
}
function sourceDate(input: unknown): SourceDate | null {
  if (input === null || input === undefined || input === '') return null;
  const raw = plainText(input);
  try { return SourceDateSchema.parse({ raw, value: raw, precision: 'day', timezone: null }); }
  catch { return SourceDateSchema.parse({ raw, value: null, precision: null, timezone: null }); }
}
function sourceEpoch(input: unknown): SourceDate | null {
  if (input === undefined || input === null || input === 0) return null;
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || input > 8_640_000_000_000_000) fail();
  const value = new Date(input).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return SourceDateSchema.parse({ raw: String(input), value, precision: 'second', timezone: 'UTC' });
}
function educationText(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null;
  return plainText(typeof input === 'object' ? record(input).name : input);
}
function projectDegree(input: unknown): unknown {
  if (input === null || typeof input === 'string') return input;
  const value = record(input);
  const degree: { name: string; id?: string | number } = { name: plainText(value.name) };
  if (typeof value.id === 'string') degree.id = plainText(value.id);
  else if (typeof value.id === 'number' && Number.isSafeInteger(value.id)) degree.id = value.id;
  return degree;
}
function salaryFields(input: Record<string, unknown>): string | null {
  const fields = Object.fromEntries(['min_salary', 'max_salary', 'currency'].filter(key => input[key] !== undefined && input[key] !== null).map(key => {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) return [key, value];
    return [key, plainText(value)];
  }));
  return Object.keys(fields).length ? JSON.stringify(fields) : null;
}
const chineseCities = new Set(('北京 上海 深圳 深圳总部 广州 成都 杭州 武汉 西安 南京 苏州 天津 重庆 长沙 合肥 厦门 南宁 徐州 南通 '+
  '无锡 常州 宁波 郑州 济南 青岛 沈阳 大连 长春 哈尔滨 石家庄 太原 南昌 福州 昆明 贵阳 兰州 银川 西宁 乌鲁木齐 呼和浩特 '+
  '海口 三亚 珠海 东莞 佛山 中山 惠州 肇庆 保定 廊坊 泰州 镇江 扬州 嘉兴 绍兴 温州 金华 合肥 芜湖 香港 澳门').split(' '));
const englishCities = new Set(('Beijing Shanghai Shenzhen Guangzhou Chengdu Hangzhou Wuhan Xian Nanjing Suzhou Tianjin Chongqing Changsha '+
  'Hefei Xiamen Nanning Xuzhou Nantong Wuxi Changzhou Ningbo Zhengzhou Jinan Qingdao Shenyang Dalian Changchun Harbin Shijiazhuang '+
  'Taiyuan Nanchang Fuzhou Kunming Guiyang Lanzhou Yinchuan Xining Urumqi Hohhot Haikou Sanya Zhuhai Dongguan Foshan Hong-Kong Macau').split(' '));
function knownChineseLocation(value: string): boolean {
  const name = value.split('·').at(-1)!.replace(/特别行政区$/, '').replace(/市$/, '').trim();
  return chineseCities.has(name) || ['中国', '中国大陆', '中国香港', '中国澳门'].includes(name);
}
function requireDomestic(locations: string[]): void {
  if (!locations.some(knownChineseLocation)) outside();
}

const tencentProvenance = { kind: 'api', sourceUrl: 'https://join.qq.com/api/v1/position/searchPosition',
  classification: { projectMappingIdList: [2, 104, 20], workCountryType: 1 } };
export function metadataProvenance(sourceId: string) {
  if (sourceId === 'tencent-internship') return structuredClone(tencentProvenance);
  const profile = internshipProfile(sourceId);
  return { kind: profile.kind, sourceUrl: profile.sourceUrl, classification: structuredClone(profile.classification) };
}
const rawJson = { parse(input: unknown): unknown { return input; } };
export const MetadataCaptureSchema = object({
  mode: enumeration(['internship-metadata-v1']), synthetic: boolean, persisted: boolean, sourceId: identifier, observedAt: instant,
  provenance: object({ kind: enumeration(['api', 'browser']), sourceUrl: identifier, classification: rawJson }),
  records: array(rawJson),
  report: optional(object({ target: count, accepted: count, rejected: count, excluded: count, duplicateIds: count,
    pagesRead: count, reportedTotal: nullable(count), targetReached: boolean, coverageComplete: boolean,
    stopReason: enumeration(['target_reached', 'source_exhausted', 'max_pages', 'request_failed', 'parse_failed', 'total_mismatch', 'repeated_page']) })),
});
export type MetadataCapture = Infer<typeof MetadataCaptureSchema>;

/** Project only required source fields. Full upstream duties and requirements never enter a metadata capture. */
export function projectMetadataRecord(sourceId: string, input: unknown): Record<string, unknown> {
  const row = record(input);
  let fields: string[];
  switch (sourceId) {
    case 'tencent-internship': fields = ['postId', 'positionTitle', 'projectId', 'projectName', 'recruitLabelName', 'workCities']; break;
    case 'xiaomi-internship': fields = ['jobPostId', 'title', 'type', 'cityZhNames', 'url', 'publishTime']; break;
    case 'cicc-internship': fields = ['Id', 'JobAdName', 'CategoryId', 'Category', 'Kind', 'Status', 'LocNames', 'Salary', 'PostDate', 'EndTime', 'Degree']; break;
    case 'nvidia-china-internship':
    case 'roche-china-internship': fields = ['title', 'externalPath', 'locationsText', 'postedOn', 'bulletFields']; break;
    case 'xpeng-internship': {
      const type = record(row.recruit_type);
      if (!Array.isArray(row.city_list)) fail();
      const info = row.job_post_info === undefined || row.job_post_info === null ? null : record(row.job_post_info);
      return { id: row.id, title: row.title, publish_time: row.publish_time,
        recruit_type: { id: type.id, name: type.name }, city_list: row.city_list.map(city => ({ name: record(city).name })),
        job_post_info: info === null ? null : Object.fromEntries(['required_degree', 'min_salary', 'max_salary', 'currency', 'expiry_time']
          .filter(key => info[key] !== undefined).map(key => [key, key === 'required_degree' ? projectDegree(info[key]) : info[key]])) };
    }
    case 'bosch-internship': fields = ['id', 'title', 'commitment', 'location', 'detailUrl', 'listSourceUrl']; break;
    default: return fail();
  }
  const projected = Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
  if (projected.Degree !== undefined) projected.Degree = projectDegree(projected.Degree);
  return projected;
}

interface MetadataFields {
  id: string; title: string; location: string; detailUrl: string; locator: string;
  publishedAt?: SourceDate | null; deadlineAt?: SourceDate | null; salaryRaw?: string | null;
  educationRaw?: string | null;
  evidenceUrl?: string;
}
function tencentFields(row: Record<string, unknown>): MetadataFields {
  if (typeof row.postId === 'string' && row.postId.startsWith('-')) outside();
  const id = stringId(row.postId);
  if (![2, 4, 12, 20].includes(row.projectId as number) || !plainText(row.projectName).includes('实习') ||
      !plainText(row.recruitLabelName).includes('实习')) outside();
  const location = plainText(row.workCities);
  requireDomestic(location.split(/\s+/));
  return { id, title: plainText(row.positionTitle), location: location.split(/\s+/).join('、'), detailUrl: `https://join.qq.com/post_detail.html?postid=${id}`,
    locator: `$.data.positionList;projectId=${row.projectId};workCountryType=1` };
}
function xiaomiFields(row: Record<string, unknown>): MetadataFields {
  if (row.type !== 3) outside();
  const id = stringId(row.jobPostId);
  const locations = textList(row.cityZhNames);
  requireDomestic(locations);
  const detailUrl = plainText(row.url);
  if (!['internship', 'topintern'].some(portal => detailUrl === `https://xiaomi.jobs.f.mioffice.cn/${portal}/position/${id}/detail`)) fail();
  return { id, title: plainText(row.title), location: locations.join('、'), detailUrl,
    locator: '$.data.list;type=3;region=official-city-list', publishedAt: sourceDate(row.publishTime) };
}
function ciccFields(row: Record<string, unknown>): MetadataFields {
  if (row.CategoryId !== '3' || row.Category !== '项目实习' || row.Kind !== '实习' || row.Status !== 1) outside();
  const id = plainText(row.Id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail();
  const locations = textList(row.LocNames);
  requireDomestic(locations);
  return { id, title: plainText(row.JobAdName), location: locations.join('、'),
    detailUrl: `https://cicc.zhiye.com/custom/projectxq?jc=3&hideMenu=1&jobAdId=${id}`,
    locator: '$.Data;CategoryId=3;Kind=实习;Status=1;region=official-LocNames', publishedAt: sourceDate(row.PostDate),
    deadlineAt: typeof row.EndTime === 'string' && row.EndTime.startsWith('2222-02-02') ? null : sourceDate(row.EndTime),
    salaryRaw: row.Salary === undefined || row.Salary === null || row.Salary === '' ? null : plainText(row.Salary), educationRaw: educationText(row.Degree) };
}
function workdayFields(sourceId: string, row: Record<string, unknown>): MetadataFields {
  const nvidia = sourceId === 'nvidia-china-internship';
  const title = plainText(row.title);
  if (!nvidia && !/实习|\bintern(?:ship)?\b/i.test(title)) outside();
  const bullets = textList(row.bulletFields);
  if (bullets.length !== 1) fail();
  const id = bullets[0], path = plainText(row.externalPath);
  if (!(nvidia ? /^JR[0-9]+$/ : /^[0-9]{6}-[0-9]+$/).test(id) || !new RegExp(`_${id}(?:-[0-9]+)?$`).test(path)) fail();
  const segments = /^\/job\/([A-Za-z-]+)\/[^/?#]+$/.exec(path);
  if (!segments) fail();
  const city = nvidia ? segments[1].replace(/^China-/, '') : segments[1];
  if ((nvidia && !segments[1].startsWith('China-')) || !englishCities.has(city)) outside();
  const rawLocation = plainText(row.locationsText);
  // A plural location label retains its wording and the city explicitly present in the official URL.
  const location = /^\d+ Locations?$/.test(rawLocation) ? `${rawLocation}（${city}）` : rawLocation;
  if (!/^\d+ Locations?$/.test(rawLocation) && rawLocation !== city && rawLocation !== `China, ${city}`) outside();
  const prefix = nvidia ? 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite' : 'https://roche.wd3.myworkdayjobs.com/roche-ext';
  return { id, title, location, detailUrl: prefix + path,
    locator: nvidia ? '$.jobPostings;workerSubType=intern;locationHierarchy1=China' : '$.jobPostings;workerSubType=temporary;searchText=实习;title=internship;region=official-job-path',
    publishedAt: sourceDate(row.postedOn) };
}
function xpengFields(row: Record<string, unknown>): MetadataFields {
  const type = record(row.recruit_type);
  if (type.id !== '202' || type.name !== '实习') outside();
  const id = stringId(row.id);
  if (!Array.isArray(row.city_list) || !row.city_list.length || row.city_list.length > 100) fail();
  const locations = row.city_list.map(city => plainText(record(city).name));
  requireDomestic(locations);
  const info = row.job_post_info === undefined || row.job_post_info === null ? null : record(row.job_post_info);
  return { id, title: plainText(row.title), location: locations.join('、'),
    detailUrl: `https://xiaopeng.jobs.feishu.cn/campus/position/${id}/detail`, locator: '$.records;recruit_type.id=202;recruit_type.name=实习;region=official-city-list',
    publishedAt: sourceEpoch(row.publish_time), educationRaw: educationText(info?.required_degree),
    salaryRaw: info === null ? null : salaryFields(info), deadlineAt: sourceEpoch(info?.expiry_time) };
}
function boschFields(row: Record<string, unknown>): MetadataFields {
  if (row.commitment !== '实习') outside();
  const id = plainText(row.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail();
  const location = plainText(row.location);
  requireDomestic(location.split(/[,，、/|;；]/));
  const listSource = plainText(row.listSourceUrl);
  if (!isBoschListingUrl(listSource)) fail();
  const detailUrl = plainText(row.detailUrl);
  if (detailUrl !== `${listSource.replace(/#\/jobs$/, '')}#/job/${id}`) fail();
  return { id, title: plainText(row.title), location, detailUrl, evidenceUrl: listSource, locator: '$.records;commitment=实习;region=official-location' };
}
export function readMetadataJob(source: SourceConfig, input: unknown, observedAt: string): Job {
  if (source.sourceId === 'tencent-internship') assertTencentInternshipSource(source);
  else assertMetadataSource(source);
  const row = projectMetadataRecord(source.sourceId, input);
  let fields: MetadataFields;
  switch (source.sourceId) {
    case 'tencent-internship': fields = tencentFields(row); break;
    case 'xiaomi-internship': fields = xiaomiFields(row); break;
    case 'cicc-internship': fields = ciccFields(row); break;
    case 'nvidia-china-internship':
    case 'roche-china-internship': fields = workdayFields(source.sourceId, row); break;
    case 'xpeng-internship': fields = xpengFields(row); break;
    case 'bosch-internship': fields = boschFields(row); break;
    default: return fail();
  }
  return JobSchema.parse({ sourceId: source.sourceId, sourceJobId: fields.id, company: source.company, title: fields.title,
    employmentType: 'internship', recruitmentChannel: 'campus', responsibilities: null, requirements: null, applicationInstructions: null,
    sourceUrl: fields.detailUrl, detailUrl: fields.detailUrl, applyUrl: null, applicationMethod: 'unknown', locationRaw: fields.location,
    educationRaw: fields.educationRaw ?? null, salaryRaw: fields.salaryRaw ?? null, publishedAt: fields.publishedAt ?? null, sourceUpdatedAt: null, deadlineAt: fields.deadlineAt ?? null,
    firstSeenAt: observedAt, lastSeenAt: observedAt, lastVerifiedAt: observedAt, closedAt: null,
    recruitmentStatus: 'open', verificationStatus: 'verified', visibility: 'hidden',
    evidence: [{ sourceUrl: fields.evidenceUrl ?? metadataProvenance(source.sourceId).sourceUrl, observedAt, parserVersion: METADATA_PARSER, locator: fields.locator }] });
}

export function readMetadataCapture(input: unknown, source: SourceConfig) {
  const capture = MetadataCaptureSchema.parse(input);
  const expectedProvenance = metadataProvenance(source.sourceId);
  if (source.sourceId === 'bosch-internship' && isBoschListingUrl(capture.provenance.sourceUrl)) expectedProvenance.sourceUrl = capture.provenance.sourceUrl;
  if (capture.synthetic !== false || capture.persisted !== false || capture.sourceId !== source.sourceId ||
      capture.records.length > 1000 || !isDeepStrictEqual(capture.provenance, expectedProvenance)) fail();
  const records = capture.records.map(row => projectMetadataRecord(source.sourceId, row));
  const jobs = records.map(row => readMetadataJob(source, row, capture.observedAt));
  if (new Set(jobs.map(job => job.sourceJobId)).size !== jobs.length) fail();
  if (capture.report && (capture.report.accepted !== jobs.length || capture.report.coverageComplete !== false ||
      capture.report.target < 1 || capture.report.target > 400 || jobs.length > capture.report.target ||
      capture.report.targetReached !== (jobs.length === capture.report.target) ||
      (capture.report.stopReason === 'target_reached') !== capture.report.targetReached)) fail();
  return { jobs, capture: { ...capture, records }, industry: source.sourceId === 'tencent-internship' ? '互联网' : internshipProfile(source.sourceId).industry };
}

/** Reuse already-saved official list pages without claiming that unhydrated details were fetched. */
export function buildTencentMetadataCapture(input: unknown): MetadataCapture {
  const full = record(input);
  if (full.synthetic !== false || full.mode !== 'tencent-internship' || !Array.isArray(full.pages)) fail();
  assertTencentInternshipSource(full.source);
  readInternshipProjectMapping(full.projectMapping);
  const report = record(full.report);
  const observedAt = plainText(report.finishedAt);
  const rows = full.pages.flatMap(page => {
    const response = record(record(page).response);
    if (response.status !== 0) fail();
    const data = record(response.data);
    if (!Array.isArray(data.positionList)) fail();
    return data.positionList;
  });
  const seen = new Set<string>();
  const records: unknown[] = [];
  for (const raw of rows) {
    const projected = projectMetadataRecord('tencent-internship', raw);
    if (typeof projected.postId === 'string' && projected.postId.startsWith('-')) continue;
    const fields = tencentFields(projected);
    if (seen.has(fields.id)) continue;
    seen.add(fields.id); records.push(projected);
  }
  return MetadataCaptureSchema.parse({ mode: 'internship-metadata-v1', synthetic: false, persisted: false, sourceId: 'tencent-internship',
    observedAt, provenance: metadataProvenance('tencent-internship'), records });
}
