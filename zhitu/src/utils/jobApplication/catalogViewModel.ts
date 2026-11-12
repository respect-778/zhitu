import type { CatalogJobDetail, CatalogJobSummary, CatalogSearchQuery } from '@/types/jobApplication/catalog/search'
import { initialFilters, matchesJob, type Job } from '@/utils/jobApplication/model'
import { classifyCompany } from '@/utils/jobApplication/companies'
import { platformFullNames, platformNames, platformJobLink } from '@/utils/jobApplication/platforms'
import { agentDevelopmentEvidence } from '@/utils/jobApplication/jobKeywords'

export const catalogPageSize = 20
export const catalogCities = [
  // Municipalities use the same whole-city administrative codes as catalog ingestion.
  ['', '全国'], ['110000', '北京'], ['310000', '上海'], ['440300', '深圳'], ['440100', '广州'],
  ['330100', '杭州'], ['510100', '成都'], ['420100', '武汉'], ['320100', '南京'], ['320500', '苏州'], ['610100', '西安'],
  ['120000', '天津'], ['500000', '重庆'], ['430100', '长沙'], ['340100', '合肥'], ['350200', '厦门'],
] as const
export const degreeLabels = { none: '学历不限', secondary: '高中 / 中专', associate: '大专', bachelor: '本科', master: '硕士', doctorate: '博士', unknown: '未知' }
export const employmentLabels = { internship: '实习', full_time: '全职', part_time: '兼职', unknown: '未知' }
export const channelLabels = { campus: '校招', social: '社招', unknown: '未知' }
const explicitEducation = /初中及以下|高中|中专|中技|大专|本科|硕士|博士/
const explicitGraduation = /(?:20\d{2}|\d{2})(?:届|年)/
export interface CatalogFilters {
  q: string
  city: string
  degree: NonNullable<CatalogSearchQuery['degree']> | ''
  employmentType: NonNullable<CatalogSearchQuery['employmentType']> | ''
  recruitmentChannel: NonNullable<CatalogSearchQuery['recruitmentChannel']> | ''
}
export const emptyCatalogFilters: CatalogFilters = { q: '', city: '', degree: '', employmentType: '', recruitmentChannel: '' }
const sessionDegrees: Partial<Record<CatalogFilters['degree'], string>> = { associate: '大专', bachelor: '本科', master: '硕士', doctorate: '博士' }
export function catalogQuery(filters: CatalogFilters, page: number, source: 'enterprise' | 'announcement' | 'all' = 'enterprise'): CatalogSearchQuery {
  return {
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.degree ? { degree: filters.degree } : {}),
    ...(filters.employmentType ? { employmentType: filters.employmentType } : {}),
    ...(filters.recruitmentChannel ? { recruitmentChannel: filters.recruitmentChannel } : {}),
    ...(source !== 'all' ? { sourceKind: source } : {}), page, pageSize: catalogPageSize,
  }
}
function sessionEmployment(job: Job): keyof typeof employmentLabels {
  if (job.job_type === '实习') return 'internship'
  return 'unknown'
}
function sessionChannel(job: Job): keyof typeof channelLabels {
  return job.job_type === '校招' ? 'campus' : job.job_type === '社招' ? 'social' : 'unknown'
}
export function matchesSessionJob(job: Job, filters: CatalogFilters): boolean {
  const query = filters.q.trim().toLocaleLowerCase()
  if (query && !`${job.title} ${job.company} ${job.description}`.toLocaleLowerCase().includes(query)) return false
  const city = catalogCities.find(([code]) => code === filters.city)?.[1]
  if (filters.city && (!city || !job.city.includes(city))) return false
  if (filters.degree === 'unknown' && job.education) return false
  if (filters.degree === 'none' && !/^(?:学历)?不限$/.test(job.education)) return false
  if (filters.degree === 'secondary' && !/高中|中专|中技/.test(job.education)) return false
  const education = sessionDegrees[filters.degree]
  if (education && !matchesJob(job, { ...initialFilters, education })) return false
  if (filters.employmentType && sessionEmployment(job) !== filters.employmentType) return false
  if (filters.recruitmentChannel && sessionChannel(job) !== filters.recruitmentChannel) return false
  return true
}
export interface SearchResultRow {
  key: string; title: string; salary: string; company: string; city: string; education: string;
  educationRaw: string; companyType: string; companySource?: string; companyFocus?: string; industry: string;
  jobType: string; graduateYear: string; graduateYearLabel?: string; graduationHint?: string; deadline: string; source: string;
  href?: string; linkLabel: string;
  matchReason?: string;
}
export function resultEducation(raw: string | null | undefined): string {
  if (!raw) return '未知'
  if (/^(?:学历)?不限$/.test(raw.trim())) return '学历不限'
  const degree = raw.trim().replace(/^(?:统招|全日制)/, '').replace(/(?:及以上|以上)?(?:学历)?[；;。]?$/, '')
  return ['初中及以下', '高中', '中专/中技', '中专', '大专', '本科', '硕士', '博士'].includes(degree) ? degree : '未知'
}
export function catalogRow(job: CatalogJobSummary, detail?: CatalogJobDetail): SearchResultRow {
  const classification = classifyCompany(job.company, '')
  const reviewed = job.reviewedMetadata
  const action = detail ? catalogApplication(detail) : undefined
  const employment = job.employmentType === 'unknown' ? '' : employmentLabels[job.employmentType]
  const channel = job.recruitmentChannel === 'unknown' ? '' : channelLabels[job.recruitmentChannel]
  const jobType = job.employmentType === 'internship' ? '实习' : channel || employment || '未知'
  return { key: `catalog:${job.id}`, title: job.title, salary: disclosed(job.salaryRaw), company: job.company,
    city: disclosed(job.locationRaw), education: reviewed ? disclosed(job.educationRaw, explicitEducation) : job.minimumDegree ? degreeLabels[job.minimumDegree] : resultEducation(job.educationRaw), educationRaw: disclosed(job.educationRaw, explicitEducation),
    companyType: disclosed(reviewed?.companyType ?? classification.label),
    companySource: reviewed ? undefined : classification.reference?.source, companyFocus: reviewed ? undefined : classification.reference?.focus,
    industry: disclosed(reviewed?.industry), jobType,
    graduateYear: reviewed?.graduateYear ?? '',
    ...(reviewed ? { graduateYearLabel: disclosed(reviewed.graduateYear, explicitGraduation), graduationHint: disclosed([reviewed.graduateStatus, reviewed.graduateQuote].filter(Boolean).join('；')) } : {}),
    deadline: job.deadlineAt ? catalogDate(job.deadlineAt) : '未知',
    source: job.sourceKind === 'announcement' ? '人社 / 招聘公告' : '企业官网', href: action?.href,
    linkLabel: action?.label || '未知' }
}
export function sessionRow(job: Job): SearchResultRow {
  const platform = job.platform || 'boss'
  const evidence = platform !== 'boss' ? agentDevelopmentEvidence(job, 'Agent开发') : undefined
  return { key: `${platform}:${job.id}`, title: job.title, salary: disclosed(job.salary), company: job.company,
    city: disclosed(job.city), education: resultEducation(job.education), educationRaw: disclosed(job.education, explicitEducation),
    companyType: disclosed(job.company_type), companySource: job.company_source, companyFocus: job.company_focus, industry: disclosed(job.industry),
    jobType: disclosed(job.job_type || job.experience), graduateYear: job.graduate_year, deadline: disclosed(job.deadline),
    graduationHint: job.graduate_year ? '招聘信息已明确毕业届数' : '未知',
    source: `${platformFullNames[platform]} · 本次读取`, href: platformJobLink(job.url, platform), linkLabel: `前往 ${platformNames[platform]}`,
    matchReason: evidence !== job.title ? evidence : undefined }
}
export function disclosed(value: string | null | undefined, explicitValue?: RegExp): string {
  const text = value?.trim()
  if (!text || text === '无') return '未知'
  const missing = /未(?:披露|明示|明确|注明|标注|单列|公开|限定|指定|写明|说明|提及)|待核(?:实|查|验)/
  if (!missing.test(text)) return text
  const hasExplicitValue = explicitValue && text.split(/[，,；;。\n]/).some(clause => {
    const match = explicitValue.exec(clause)
    return match && !missing.test(clause.slice(0, match.index + match[0].length))
  })
  return hasExplicitValue ? text : '未知'
}
export function catalogDate(value: CatalogJobSummary['publishedAt']) {
  if (value?.precision === 'second' && /^\d+$/.test(value.raw) && value.value?.length === 20) {
    const timestamp = Date.parse(value.value)
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value.value.replace(/Z$/, '.000Z')) return value.value.slice(0, 10)
  }
  return disclosed(value?.raw || value?.value)
}
export function safeCatalogHref(value: string | null): string | undefined {
  if (!value || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? value : undefined
  } catch { return undefined }
}
export function catalogApplication(job: CatalogJobDetail): { label: string; href?: string } {
  if (job.applicationMethod === 'web_form') {
    const href = safeCatalogHref(job.applyUrl)
    if (href) return { label: '前往申请', href }
  }
  const href = safeCatalogHref(job.detailUrl)
  return href ? { label: job.sourceKind === 'announcement' ? '前往公告' : '前往官网', href } : { label: '未知' }
}
