import { initialFilters, sameQuery, type Filters, type Job } from '@/utils/jobApplication/model'
import { normalizeJobTime } from '@/utils/jobApplication/jobTime'
import { platformJobLink, platformJobPath, type JobPlatform } from '@/utils/jobApplication/platforms'
import type { ReaderStatus } from '@/api/jobApplication/api'

export interface CachedJobSearch {
  version: 1
  savedAt: string
  query: Filters
  jobs: Job[]
  pending: Job[]
  seen: string[]
  sourceEnd: 'source_end' | 'repeated' | null
  run: ReaderStatus['run']
}
const databaseName = 'knowvia-job-search'
const storeName = 'searches'
const jobFields = ['id', 'title', 'company', 'salary', 'city', 'education', 'experience', 'industry',
  'company_type', 'graduate_year', 'job_type', 'deadline', 'url', 'description', 'detail_security_id'] as const

function cachedJob(value: unknown, platform: JobPlatform): Job | null {
  if (!value || typeof value !== 'object') return null
  const job = value as Job
  if ((job.platform || 'boss') !== platform || !jobFields.every(key => typeof job[key] === 'string')
    || !platformJobLink(job.url, platform) || new URL(job.url).pathname !== job.id
    || !['unread', 'reading', 'complete', 'partial', 'error'].includes(job.detail_state)
    || !Array.isArray(job.company_tags)) return null
  const clean = Object.fromEntries(jobFields.map(key => [key, job[key]])) as unknown as Job
  if (platform !== 'boss') clean.platform = platform
  clean.company_tags = job.company_tags.filter(tag => typeof tag === 'string')
  clean.detail_state = job.detail_state === 'reading' ? 'unread' : job.detail_state
  if (typeof job.detail_error === 'string') clean.detail_error = job.detail_error
  for (const field of ['published_at', 'updated_at'] as const) {
    const value = normalizeJobTime(job[field])
    if (value) clean[field] = value
  }
  if (typeof job.company_focus === 'string') clean.company_focus = job.company_focus
  if (typeof job.company_source === 'string') {
    try {
      const url = new URL(job.company_source)
      if (url.protocol === 'https:' && !url.username && !url.password) clean.company_source = job.company_source
    } catch { /* Ignore an invalid reference. */ }
  }
  return clean
}

function readCachedSearch(value: unknown, platform: JobPlatform): CachedJobSearch | null {
  if (!value) return null
  const data = value as CachedJobSearch
  if (data.version !== 1 || !data.query || typeof data.query.keyword !== 'string'
    || typeof data.query.city !== 'string' || !Array.isArray(data.jobs) || !Array.isArray(data.pending)
    || !Array.isArray(data.seen) || typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))
    || !data.run || typeof data.run.message !== 'string'
    || !['idle', 'running', 'done', 'partial', 'error'].includes(data.run.state)
    || ![null, 'page_limit', 'source_end', 'repeated', 'error', 'cancelled'].includes(data.run.stop_reason)
    || !['found', 'raw_count', 'skipped_count', 'pages_read', 'next_page'].every(key => {
      const number = data.run[key as keyof ReaderStatus['run']]
      return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0
    }) || data.run.next_page < 1 || data.run.next_page > 501
    || ![null, 'source_end', 'repeated'].includes(data.sourceEnd)) throw new Error('Invalid cached search')
  const query = Object.fromEntries(Object.entries(initialFilters).map(([key, fallback]) =>
    [key, typeof data.query[key as keyof Filters] === 'string' ? data.query[key as keyof Filters] : fallback])) as unknown as Filters
  if (!data.jobs.length && !data.pending.length && !data.run.raw_count && ['error', 'cancelled'].includes(data.run.stop_reason || '')) return null
  return { version: 1, savedAt: data.savedAt, query,
    jobs: data.jobs.map(job => cachedJob(job, platform)).filter((job): job is Job => Boolean(job)),
    pending: data.pending.map(job => cachedJob(job, platform)).filter((job): job is Job => Boolean(job)),
    seen: data.seen.filter(id => typeof id === 'string' && platformJobPath(platform, id)),
    sourceEnd: data.sourceEnd, run: { ...data.run } }
}

const latestKey = (platform: JobPlatform) => platform === 'boss' ? 'latest' : `latest:${platform}`
const queryKey = (platform: JobPlatform, query: Filters) => `${latestKey(platform)}:query:${JSON.stringify(
  Object.keys(initialFilters).filter(key => key !== 'sort').map(key => String(query[key as keyof Filters]).trim()))}`

function accessCache(mode: IDBTransactionMode, key: string, value?: CachedJobSearch, platform?: JobPlatform): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Browser storage unavailable')); return }
    const opening = indexedDB.open(databaseName, 1)
    opening.onupgradeneeded = () => { opening.result.createObjectStore(storeName) }
    opening.onerror = () => reject(opening.error)
    opening.onblocked = () => reject(new Error('Browser storage blocked'))
    opening.onsuccess = () => {
      const db = opening.result
      let result: unknown
      const transaction = db.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      const operation = store.get(key)
      if (mode === 'readwrite' && platform) {
        const latest = latestKey(platform)
        const current = store.get(latest)
        current.onsuccess = () => {
          // Migrate the previous single-slot cache in this same transaction before
          // replacing it, so the first new query cannot lose legacy results.
          try {
            const previous = readCachedSearch(current.result, platform)
            if (previous && queryKey(platform, previous.query) !== key) store.put(previous, queryKey(platform, previous.query))
          } catch { /* A new successful search can replace a malformed legacy record. */ }
          const previousTime = Date.parse(current.result?.savedAt)
          if (!Number.isFinite(previousTime) || previousTime <= Date.parse(value!.savedAt)) store.put(value, latest)
        }
      }
      operation.onsuccess = () => {
        result = operation.result
        const previousTime = Date.parse((result as CachedJobSearch | undefined)?.savedAt || '')
        if (mode === 'readwrite' && (!Number.isFinite(previousTime) || previousTime <= Date.parse(value!.savedAt))) store.put(value, key)
      }
      transaction.oncomplete = () => { db.close(); resolve(result) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
      transaction.onerror = () => { db.close(); reject(transaction.error) }
    }
  })
}
export async function loadJobCache(platform: JobPlatform = 'boss', query?: Filters): Promise<CachedJobSearch | null> {
  if (query) {
    const saved = readCachedSearch(await accessCache('readonly', queryKey(platform, query)), platform)
    if (saved) return saved
  }
  const previous = readCachedSearch(await accessCache('readonly', latestKey(platform)), platform)
  return query && previous && !sameQuery(previous.query, query) ? null : previous
}
export async function saveJobCache(value: CachedJobSearch, platform: JobPlatform = 'boss'): Promise<void> {
  if (!value.jobs.length && !value.pending.length && !value.run.raw_count && ['error', 'cancelled'].includes(value.run.stop_reason || '')) return
  await accessCache('readwrite', queryKey(platform, value.query), value, platform)
}
