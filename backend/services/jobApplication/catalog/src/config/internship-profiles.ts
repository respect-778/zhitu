import { SourceConfigSchema, type Job, type SourceConfig } from '../../contracts/index.ts';

export const METADATA_PARSER = 'internship-metadata-v1';
export const CICC_PORTAL = '1bb97a43-1bb9-42c2-b5c6-19ddc82c0cb9';
export const NVIDIA_INTERN_FACET = '0c40f6bd1d8f10adf6dae42e46d44a17';
export const NVIDIA_CHINA_FACET = '2fcb99c455831013ea529fe151e3323c';
export const ROCHE_TEMPORARY_FACET = '5cbb2c6fdeee0191ffb0cddb54348f05';

export interface InternshipProfile {
  sourceId: string;
  company: string;
  industry: string;
  entryUrl: string;
  allowedHosts: string[];
  kind: 'api' | 'browser';
  sourceUrl: string;
  classification: Record<string, unknown>;
}
export const internshipProfiles: readonly InternshipProfile[] = [
  { sourceId: 'xiaomi-internship', company: '小米集团', industry: '消费电子', entryUrl: 'https://hr.xiaomi.com/',
    allowedHosts: ['hr.xiaomi.com', 'xiaomi.jobs.f.mioffice.cn'], kind: 'api',
    sourceUrl: 'https://hr.xiaomi.com/website/api/agent/searchJobPage', classification: { type: 3 } },
  { sourceId: 'cicc-internship', company: '中金公司', industry: '金融', entryUrl: 'https://cicc.zhiye.com/',
    allowedHosts: ['cicc.zhiye.com'], kind: 'api', sourceUrl: 'https://cicc.zhiye.com/api/Jobad/GetJobAdPageList',
    classification: { Category: [3], PortalId: CICC_PORTAL } },
  { sourceId: 'nvidia-china-internship', company: '英伟达中国', industry: '半导体/AI计算',
    entryUrl: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite', allowedHosts: ['nvidia.wd5.myworkdayjobs.com'], kind: 'api',
    sourceUrl: 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs',
    classification: { workerSubType: NVIDIA_INTERN_FACET, locationHierarchy1: NVIDIA_CHINA_FACET, tenant: 'nvidia', site: 'NVIDIAExternalCareerSite' } },
  { sourceId: 'roche-china-internship', company: '罗氏中国', industry: '医药',
    entryUrl: 'https://roche.wd3.myworkdayjobs.com/roche-ext', allowedHosts: ['roche.wd3.myworkdayjobs.com'], kind: 'api',
    sourceUrl: 'https://roche.wd3.myworkdayjobs.com/wday/cxs/roche/roche-ext/jobs',
    classification: { workerSubType: ROCHE_TEMPORARY_FACET, searchText: '实习', tenant: 'roche', site: 'roche-ext' } },
  { sourceId: 'xpeng-internship', company: '小鹏汽车', industry: '汽车新能源',
    entryUrl: 'https://xiaopeng.jobs.feishu.cn/campus/position/list', allowedHosts: ['xiaopeng.jobs.feishu.cn'], kind: 'browser',
    sourceUrl: 'https://xiaopeng.jobs.feishu.cn/campus/position/list?keywords=%E5%AE%9E%E4%B9%A0', classification: { portal: 6, keyword: '实习', recruitTypeId: '202' } },
  { sourceId: 'bosch-internship', company: '博世中国', industry: '工业制造',
    entryUrl: 'https://app.mokahr.com/campus-recruitment/bosch/67942', allowedHosts: ['app.mokahr.com'], kind: 'browser',
    sourceUrl: 'https://app.mokahr.com/campus-recruitment/bosch/67942', classification: { commitment: '实习' } },
];
export const metadataSourceIds = internshipProfiles.map(profile => profile.sourceId);

export function internshipProfile(sourceId: string): InternshipProfile {
  const profile = internshipProfiles.find(profile => profile.sourceId === sourceId);
  if (!profile) throw new Error('METADATA_SOURCE_INVALID');
  return profile;
}
export function metadataSource(profile: InternshipProfile): SourceConfig {
  return SourceConfigSchema.parse({ sourceId: profile.sourceId, kind: 'enterprise', adapter: 'internship-metadata',
    company: profile.company, entryUrl: profile.entryUrl, allowedHosts: [...profile.allowedHosts],
    scopeKey: `${profile.sourceId}:china-hk-macao`, recruitmentChannel: 'campus', enabled: false });
}
export function assertMetadataSource(input: SourceConfig): InternshipProfile {
  const profile = internshipProfile(input.sourceId);
  if (JSON.stringify(SourceConfigSchema.parse(input)) !== JSON.stringify(metadataSource(profile))) throw new Error('METADATA_SOURCE_INVALID');
  return profile;
}
export function isBoschListingUrl(input: string): boolean {
  return /^https:\/\/app\.mokahr\.com\/campus-recruitment\/bosch\/(?:67942|75909)(?:\?locale=zh-CN)?(?:#\/jobs)?$/.test(input);
}

/** Tenant, path, stable source ID and actual listing evidence remain publication invariants. */
export function assertMetadataSourceUrls(job: Job, source: SourceConfig): void {
  const profile = assertMetadataSource(source);
  if (job.employmentType !== 'internship' || job.recruitmentChannel !== 'campus' || job.company !== profile.company ||
      job.applyUrl !== null || job.applicationMethod !== 'unknown' || job.detailUrl === null || job.sourceUrl !== job.detailUrl ||
      job.evidence.some(item => (source.sourceId === 'bosch-internship' ? !isBoschListingUrl(item.sourceUrl) : item.sourceUrl !== profile.sourceUrl) ||
        item.parserVersion !== METADATA_PARSER)) throw new Error('METADATA_URL_INVALID');
  const id = job.sourceJobId;
  let valid = false;
  switch (source.sourceId) {
    case 'xiaomi-internship':
      valid = /^[1-9][0-9]{0,63}$/.test(id) && ['internship', 'topintern'].some(portal =>
        job.detailUrl === `https://xiaomi.jobs.f.mioffice.cn/${portal}/position/${id}/detail`);
      break;
    case 'cicc-internship':
      valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) &&
        job.detailUrl === `https://cicc.zhiye.com/custom/projectxq?jc=3&hideMenu=1&jobAdId=${id}`;
      break;
    case 'nvidia-china-internship':
      valid = /^JR[0-9]+$/.test(id) && /^https:\/\/nvidia\.wd5\.myworkdayjobs\.com\/en-US\/NVIDIAExternalCareerSite\/job\/China-[A-Za-z-]+\/[^/?#]+$/.test(job.detailUrl) &&
        new RegExp(`_${id}(?:-[0-9]+)?$`).test(job.detailUrl);
      break;
    case 'roche-china-internship':
      valid = /^[0-9]{6}-[0-9]+$/.test(id) && /^https:\/\/roche\.wd3\.myworkdayjobs\.com\/roche-ext\/job\/[A-Za-z-]+\/[^/?#]+$/.test(job.detailUrl) &&
        new RegExp(`_${id}(?:-[0-9]+)?$`).test(job.detailUrl);
      break;
    case 'xpeng-internship':
      valid = /^[1-9][0-9]{0,63}$/.test(id) && job.detailUrl === `https://xiaopeng.jobs.feishu.cn/campus/position/${id}/detail`;
      break;
    case 'bosch-internship':
      valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) &&
        isBoschListingUrl(job.detailUrl.split('#')[0]) && job.detailUrl === `${job.detailUrl.split('#')[0]}#/job/${id}`;
      break;
  }
  if (!valid) throw new Error('METADATA_URL_INVALID');
}
