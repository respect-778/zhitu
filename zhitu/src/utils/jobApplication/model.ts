import { classifyCompany } from '@/utils/jobApplication/companies';
import { platformJobLink, type JobPlatform } from '@/utils/jobApplication/platforms';
import { agentDevelopmentEvidence, isAgentDevelopmentSearch } from '@/utils/jobApplication/jobKeywords';
import { normalizeJobTime } from '@/utils/jobApplication/jobTime';

export interface Filters {
  keyword: string; city: string; education: string; industry: string; company_type: string; job_type: string;
  graduate_year: string; experience: string; salary_min: string; salary_max: string; salary_unit: string; sort: string;
}
export interface Job {
  platform?: JobPlatform;
  id: string; title: string; company: string; salary: string; city: string; education: string; experience: string;
  industry: string; company_type: string; graduate_year: string; job_type: string; deadline: string;
  url: string; description: string; company_tags: string[]; company_source?: string; company_focus?: string;
  detail_security_id: string; detail_state: 'unread' | 'reading' | 'complete' | 'partial' | 'error'; detail_error?: string;
  published_at?: string; updated_at?: string;
}
export const initialFilters: Filters = {
  keyword: '', city: '全国', education: '', industry: '', company_type: '', job_type: '', graduate_year: '',
  experience: '', salary_min: '', salary_max: '', salary_unit: '月', sort: 'salary_desc',
};
type SalaryPeriod = '月' | '天' | '年' | '小时';
const salaryWorkdaysPerMonth = 22;
const salaryHoursPerDay = 8;
const salaryMonthlyFactors: Record<SalaryPeriod, number> = { 月: 1, 天: salaryWorkdaysPerMonth, 年: 1 / 12, 小时: salaryWorkdaysPerMonth * salaryHoursPerDay };
export const salaryConversionDescription = `跨单位筛选与排序按每月 ${salaryWorkdaysPerMonth} 天、每天 ${salaryHoursPerDay} 小时、每年 12 个月估算，不计额外薪数与奖金；展示保留招聘平台原文，实际收入以招聘方约定为准。`;
export const salarySortDescription = `按薪资上限从高到低排列，上限相同时比较下限。${salaryConversionDescription}面议或无法比较的薪资排在最后。`;

export function parseSalary(value: string): { min: number; max: number; unit: SalaryPeriod } | null {
  // Parse a separate copy: the salary shown to the user must remain the source text.
  const normalized = value.normalize('NFKC').replace(/,/g, '').trim()
    .replace(/(?:[·•・*×]|\s+)\s*\d+\s*薪$/, '').trim();
  const match = normalized.match(/^(?:人民币|[¥￥])?\s*(\d+(?:\.\d+)?)\s*([kK千万]?)\s*(?:元)?\s*(?:[-~–—至到]\s*(\d+(?:\.\d+)?)\s*([kK千万]?)\s*(?:元)?)?\s*(?:(?:\/|每)\s*(小时|时|天|日|月|年))?$/);
  if (!match) return null;
  const [, low, lowMagnitude, high, highMagnitude, period] = match;
  // BOSS's standard salary labels without a period use monthly pay, e.g. 8-12K.
  const scale: Record<string, number> = { k: 1000, K: 1000, 千: 1000, 万: 10000 };
  const min = Number(low) * (scale[lowMagnitude || highMagnitude] || 1);
  const max = high ? Number(high) * (scale[highMagnitude || lowMagnitude] || 1) : min;
  const unit = period === '日' ? '天' : period === '时' ? '小时' : (period || '月') as SalaryPeriod;
  return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min ? { min, max, unit } : null;
}

export function compareSalaryDescending(a: Pick<Job, 'salary'>, b: Pick<Job, 'salary'>) {
  const left = parseSalary(a.salary), right = parseSalary(b.salary);
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return right.max * salaryMonthlyFactors[right.unit] - left.max * salaryMonthlyFactors[left.unit]
    || right.min * salaryMonthlyFactors[right.unit] - left.min * salaryMonthlyFactors[left.unit];
}
export function jobLink(value: string) {
  return platformJobLink(value, 'boss');
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
export function effectiveFilters(filters: Filters): Filters {
  return !filters.job_type && /实习|\bintern(?:ship)?\b/i.test(filters.keyword)
    ? { ...filters, job_type: '实习' } : filters;
}
export function sourceKeyword(filters: Filters) {
  // Campus recruitment has no verified jobType code in this reader. Use BOSS's
  // normal keyword search, including on older helpers, then check each result.
  const keyword = filters.keyword.trim();
  return filters.job_type === '校招' && !/校招|校园招聘|应届/.test(keyword) ? `${keyword} 校招` : keyword;
}
function metadataText(value: unknown) {
  return text(value).replace(/来自\s*BOSS\s*直聘/gi, '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '');
}
function graduationYears(...values: unknown[]) {
  const years = new Set<string>();
  const add = (value: string) => years.add(value.length === 2 ? `20${value}` : value);
  for (const value of values.flat()) {
    const source = metadataText(value).replace(/毕业(?:时间|年份|年度|届数)\s*[：:]\s*((?:20)?\d{2}(?:\s*[-~至、,，/和]\s*(?:20)?\d{2})*)\s*(?:年|届)/g, '$1届');
    for (const match of source.matchAll(/(?<!\d)((?:20)?\d{2}(?:\s*[-~至、,，/和]\s*(?:20)?\d{2})*)\s*(?:届|年\s*毕业)/g)) {
      const parts = match[1].match(/(?:20)?\d{2}/g)!;
      if (parts.length === 2 && /[-~至]/.test(match[1])) {
        const [first, last] = parts.map(part => Number(part.length === 2 ? `20${part}` : part));
        if (last >= first && last - first <= 5) { for (let year = first; year <= last; year++) add(String(year)); continue; }
      }
      parts.forEach(add);
    }
  }
  return [...years].sort().join('/');
}
function graduationRequirement(raw: Record<string, unknown>) {
  const year = metadataText(raw.graduateYear);
  return graduationYears(/^\d{2,4}\s*年?$/.test(year) ? `${year.replace(/\s*年?$/, '')}届` : year)
    || graduationYears(raw.jobLabels, raw.postDescription);
}
function deadlineDate(value: unknown) {
  const input = metadataText(value);
  if (/^(?:长期有效|长期招聘|招满即止|招满为止|额满即止)$/.test(input)) return input;
  const match = input.match(/^(20\d{2})\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})(?:日)?(?=$|T|\s)/);
  if (!match) return '';
  const [, y, m, d] = match, date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function descriptionDeadline(value: unknown) {
  const match = metadataText(value).match(/(?:招聘|报名|投递)?截止(?:日期|时间)\s*[：:]\s*(20\d{2}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}(?:日)?|长期有效|长期招聘|招满即止|招满为止|额满即止)/);
  return deadlineDate(match?.[1]);
}
export function normalizeJob(value: unknown): Job | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const platform = raw.platform === 'zhaopin' || raw.platform === 'liepin' ? raw.platform : 'boss';
  let link = platformJobLink(text(raw.jobUrl), platform) || platformJobLink(text(raw.url), platform);
  const key = text(raw.encryptJobId);
  if (!link && platform === 'boss' && /^[\w-]+$/.test(key)) {
    const url = new URL(`https://www.zhipin.com/job_detail/${key}.html`);
    for (const field of ['securityId', 'lid']) if (text(raw[field])) url.searchParams.set(field, text(raw[field]));
    link = url.href;
  }
  if (!link) return null;
  const company = text(raw.brandName);
  const classification = classifyCompany(company, text(raw.brandNatureName));
  const title = text(raw.jobName), experience = text(raw.jobExperience);
  // Explicit graduation requirements outrank a recruitment-year title. A title
  // like "【2027校招】" can supply the year before any detail request completes.
  const graduateYear = graduationRequirement(raw)
    || graduationYears(title.replace(/(?<!\d)((?:20)?\d{2}(?:\s*[-~至、,，/和]\s*(?:20)?\d{2})*)\s*(?:年)?\s*校招/g, '$1届'));
  const disclosedType = text(raw.jobTypeName);
  const campusTitle = /校招|校园招聘|应届/.test(title) && !/非校招|非应届|不招应届|不接受应届/.test(title);
  const graduateRequirement = /^(?:在校\s*[/／]\s*)?应届(?:生|毕业生)?$/.test(experience);
  // Observed BOSS result value is 4; its search parameter is separately 1902.
  // An explicit non-intern type must not be overridden by e.g. “有实习经历优先”.
  const jobType = String(raw.jobType) === '4' ? '实习'
    : ['实习', '校招', '社招'].includes(disclosedType) ? disclosedType
    : raw.jobType == null && /实习/.test(title) ? '实习'
    : campusTitle || graduateRequirement ? '校招'
    : raw.jobType == null && /实习|在校/.test(`${title} ${experience}`) ? '实习'
    : '';
  const deadline = deadlineDate(raw.applicationDeadline) || descriptionDeadline(raw.postDescription);
  return {
    ...(platform !== 'boss' ? { platform } : {}),
    id: new URL(link).pathname, title, company, salary: text(raw.salaryDesc) || text(raw.salary),
    city: text(raw.cityName) + text(raw.areaDistrict), education: text(raw.jobDegree), experience,
    industry: text(raw.brandIndustry), company_type: classification.label, company_tags: classification.tags,
    company_source: classification.reference?.source, company_focus: classification.reference?.focus,
    graduate_year: graduateYear,
    job_type: jobType, deadline,
    published_at: normalizeJobTime(raw.published_at) || normalizeJobTime(raw.publishTime),
    updated_at: normalizeJobTime(raw.updated_at) || normalizeJobTime(raw.updateTime),
    url: link, description: text(raw.postDescription), detail_security_id: text(raw.securityId) || new URL(link).searchParams.get('securityId') || '',
    detail_state: (platform !== 'boss' && raw.detailRead === true) || (graduateYear && deadline) ? 'complete' : 'unread',
  };
}
export function applyJobDetails(job: Job, details: Record<string, unknown>): Job {
  const parsed = normalizeJob({ platform: job.platform, url: job.url, jobName: job.title, jobExperience: job.experience,
    jobTypeName: details.jobType == null ? job.job_type : '', ...details })!;
  return { ...job, description: parsed.description || job.description,
    published_at: parsed.published_at || job.published_at, updated_at: parsed.updated_at || job.updated_at,
    graduate_year: graduationRequirement(details) || job.graduate_year || parsed.graduate_year,
    deadline: parsed.deadline || job.deadline,
    job_type: parsed.job_type, detail_state: details.detailWarning ? 'partial' : 'complete', detail_error: text(details.detailWarning) || undefined };
}
const industryGroups: Record<string, string[]> = {
  互联网: ['互联网', '移动互联网', '互联网金融', '互联网生活服务', '在线教育', '计算机软件', '社交网络', '游戏'],
  制造业: ['制造业', '机械设备/机电/重工', '仪器仪表/工业自动化', '汽车生产', '汽车零部件', '电子/半导体/集成电路'],
  金融: ['金融', '银行', '证券/期货', '基金', '保险', '投资/融资', '互联网金融'],
  医疗健康: ['医疗健康', '医疗设备/器械', '医疗/护理/卫生', '生物/制药'],
  教育培训: ['教育培训', '在线教育', '培训机构', '学前教育', '职业培训'],
  电子商务: ['电子商务'], 新能源: ['新能源', '新能源车'], 人工智能: ['人工智能'],
};
export function matchesJob(job: Job, filters: Filters) {
  filters = effectiveFilters(filters);
  // Sources can match mentions in qualifications. Agent development needs actual duties.
  if (job.platform && job.platform !== 'boss' && isAgentDevelopmentSearch(filters.keyword) && !agentDevelopmentEvidence(job, filters.keyword)) return false;
  if (filters.education && job.education.replace(/^(统招|全日制)/, '').replace(/及以上$/, '') !== filters.education) return false;
  if (filters.industry && !(industryGroups[filters.industry] || [filters.industry]).includes(job.industry)) return false;
  if (filters.company_type && !job.company_tags.includes(filters.company_type)) return false;
  if (filters.graduate_year && !job.graduate_year.split('/').includes(filters.graduate_year)) return false;
  for (const field of ['job_type', 'experience'] as const) {
    if (filters[field] && job[field] !== filters[field]) return false;
  }
  if (filters.salary_min || filters.salary_max) {
    const range = parseSalary(job.salary);
    if (!range) return false;
    const targetFactor = salaryMonthlyFactors[filters.salary_unit as SalaryPeriod];
    if (!targetFactor) return false;
    // Compare overlapping ranges on the same basis as sorting. A monthly
    // preference must not silently exclude internships advertised per day.
    const factor = salaryMonthlyFactors[range.unit];
    if ((filters.salary_min && range.max * factor < Number(filters.salary_min) * targetFactor)
      || (filters.salary_max && range.min * factor > Number(filters.salary_max) * targetFactor)) return false;
  }
  return true;
}
export function sameQuery(a: Filters, b: Filters) {
  return Object.keys(initialFilters).filter(key => key !== 'sort').every(key => a[key as keyof Filters].trim() === b[key as keyof Filters].trim());
}
