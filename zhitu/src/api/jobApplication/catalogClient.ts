import type { CatalogJobDetail, CatalogJobSummary, CatalogSearchQuery, CatalogSearchResult } from '@/types/jobApplication/catalog/search'

type ClientErrorCode = 'INVALID_REQUEST' | 'JOB_NOT_FOUND' | 'CATALOG_UNAVAILABLE' | 'INVALID_RESPONSE' | 'TIMEOUT'
export class CatalogClientError extends Error {
  readonly code: ClientErrorCode
  constructor(code: ClientErrorCode) {
    const messages: Record<ClientErrorCode, string> = {
      INVALID_REQUEST: '搜索条件有误，请调整后重试。', JOB_NOT_FOUND: '该岗位暂不可查看，可能已下架。',
      CATALOG_UNAVAILABLE: '官网岗位服务暂不可用，请稍后重试。', INVALID_RESPONSE: '岗位信息暂时无法读取，请重试。',
      TIMEOUT: '读取岗位超时，请重试。',
    }
    super(messages[code]); this.code = code
  }
}
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const nullableText = (value: unknown) => value === null || typeof value === 'string'
const isDate = (value: unknown) => value === null || (isObject(value) && typeof value.raw === 'string' && nullableText(value.value))
export const catalogJobId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function isReviewedMetadata(value: unknown): boolean {
  if (value === undefined) return true
  if (!isObject(value)) return false
  const fields = ['batchId', 'industry', 'companyType', 'graduateYear', 'graduateStatus', 'graduateQuote', 'graduateSourceUrl']
  const nonblankText = (input: unknown): input is string => typeof input === 'string' && input.trim().length > 0
  if (Object.keys(value).length !== fields.length || !Object.keys(value).every(key => fields.includes(key))
    || !['batchId', 'industry', 'companyType', 'graduateYear', 'graduateStatus'].every(key => nonblankText(value[key]))
    || value.batchId !== (value.batchId as string).trim()
    || !(value.graduateQuote === null || nonblankText(value.graduateQuote))) return false
  if (value.graduateSourceUrl === null) return true
  const sourceUrl = value.graduateSourceUrl
  if (typeof sourceUrl !== 'string' || !/^https:\/\//.test(sourceUrl) || [...sourceUrl].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\')) return false
  try {
    const url = new URL(sourceUrl)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}
function isSummary(value: unknown): value is CatalogJobSummary {
  if (!isObject(value)) return false
  return typeof value.id === 'string' && catalogJobId.test(value.id) && typeof value.sourceId === 'string'
    && ['enterprise', 'announcement'].includes(String(value.sourceKind))
    && typeof value.title === 'string' && typeof value.company === 'string'
    && ['internship', 'full_time', 'part_time', 'unknown'].includes(String(value.employmentType))
    && ['campus', 'social', 'unknown'].includes(String(value.recruitmentChannel))
    && (value.minimumDegree === null || ['none', 'secondary', 'associate', 'bachelor', 'master', 'doctorate'].includes(String(value.minimumDegree)))
    && nullableText(value.locationRaw) && nullableText(value.educationRaw) && nullableText(value.salaryRaw)
    && isReviewedMetadata(value.reviewedMetadata)
    && Array.isArray(value.cityCodes) && value.cityCodes.every(code => typeof code === 'string' && /^\d{6}$/.test(code))
    && isDate(value.publishedAt) && isDate(value.sourceUpdatedAt) && isDate(value.deadlineAt)
    && ['open', 'closed', 'expired', 'unknown'].includes(String(value.recruitmentStatus))
}
async function readJson(path: string, signal: AbortSignal, maxBytes: number): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 10_000)
  try {
    const response = await fetch(`/api/catalog/v1${path}`, { signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' } })
    if (!response.ok) {
      void response.body?.cancel()
      throw new CatalogClientError(response.status === 400 ? 'INVALID_REQUEST' : response.status === 404 ? 'JOB_NOT_FOUND' : 'CATALOG_UNAVAILABLE')
    }
    if (!response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length')) > maxBytes || !response.body) {
      void response.body?.cancel()
      throw new CatalogClientError('INVALID_RESPONSE')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > maxBytes) { await reader.cancel(); throw new CatalogClientError('INVALID_RESPONSE') }
        chunks.push(next.value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (timedOut) throw new CatalogClientError('TIMEOUT')
    if (error instanceof CatalogClientError) throw error
    if (error instanceof SyntaxError || error instanceof TypeError && controller.signal.aborted) throw new CatalogClientError('INVALID_RESPONSE')
    throw new CatalogClientError('CATALOG_UNAVAILABLE')
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel) }
}
export async function searchCatalog(query: CatalogSearchQuery, signal: AbortSignal): Promise<CatalogSearchResult> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value))
  const result = await readJson(`/jobs?${params}`, signal, 512 * 1024)
  if (!isObject(result) || !Array.isArray(result.items) || result.items.length > query.pageSize || !result.items.every(isSummary)
    || !Number.isSafeInteger(result.total) || (result.total as number) < 0 || result.page !== query.page || result.pageSize !== query.pageSize) throw new CatalogClientError('INVALID_RESPONSE')
  return result as unknown as CatalogSearchResult
}
export async function getCatalogJob(id: string, signal: AbortSignal): Promise<CatalogJobDetail> {
  if (!catalogJobId.test(id)) throw new CatalogClientError('JOB_NOT_FOUND')
  const result = await readJson(`/jobs/${encodeURIComponent(id)}`, signal, 160 * 1024)
  const item = isObject(result) ? result.item : undefined
  if (!isSummary(item) || !isObject(item) || item.id !== id || !nullableText(item.responsibilities) || !nullableText(item.requirements)
    || !nullableText(item.applicationInstructions) || !nullableText(item.detailUrl) || !nullableText(item.applyUrl)
    || typeof item.sourceUrl !== 'string' || !['web_form', 'email', 'offline', 'instructions', 'unknown'].includes(String(item.applicationMethod))) throw new CatalogClientError('INVALID_RESPONSE')
  return item as unknown as CatalogJobDetail
}
export async function getCatalogPageDetails(items: CatalogJobSummary[], signal: AbortSignal): Promise<Map<string, CatalogJobDetail>> {
  const details = new Map<string, CatalogJobDetail>()
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length && !signal.aborted) {
      const job = items[next++]
      try { details.set(job.id, await getCatalogJob(job.id, signal)) }
      catch (error) { if (signal.aborted) throw error }
    }
  }))
  return details
}
export const catalogErrorMessage = (error: unknown) => error instanceof CatalogClientError ? error.message : '官网岗位服务暂不可用，请稍后重试。'
