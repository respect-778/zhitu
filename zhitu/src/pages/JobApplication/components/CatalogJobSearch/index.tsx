import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, LoaderCircle, MapPin, Search, X } from 'lucide-react'
import type { CatalogSearchResult } from '@/types/jobApplication/catalog/search'
import { catalogErrorMessage, getCatalogPageDetails, searchCatalog } from '@/api/jobApplication/catalogClient'
import { catalogCities, catalogPageSize, catalogQuery, catalogRow, channelLabels, degreeLabels, employmentLabels, emptyCatalogFilters, matchesSessionJob, sessionRow, type CatalogFilters, type SearchResultRow } from '@/utils/jobApplication/catalogViewModel'
import { restoreAllCachedJobs, allSessionJobs } from '@/api/jobApplication/api'
import { JobSearchHeading, JobSourceSelector, type JobSourceMode } from '@/pages/JobApplication/components/JobSearchChrome/index'
import styles from '@/pages/JobApplication/index.module.less'
import JobResults from '@/pages/JobApplication/components/JobResults/index'
import OfficialAutofillAction from '@/pages/JobApplication/components/OfficialAutofillAction/index'
import { selectedApplicationTargets } from '@/api/jobApplication/jobActions'
import { useJobSelection } from '@/hooks/jobApplication/useJobSelection'

function LabelOptions({ labels }: { labels: Record<string, string> }) {
  return <><option value="">不限</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>
}

export default function CatalogJobSearch({ mode, onModeChange }: { mode: Exclude<JobSourceMode, 'boss' | 'zhaopin' | 'liepin'>; onModeChange: (mode: JobSourceMode) => void }) {
  const [draft, setDraft] = useState<CatalogFilters>({ ...emptyCatalogFilters })
  const [selection, setSelection] = useState({ filters: { ...emptyCatalogFilters }, page: 1, attempt: 0 })
  const selectionScope = JSON.stringify([mode, selection.filters, selection.attempt])
  const batchSelection = useJobSelection(selectionScope)
  const [response, setResponse] = useState<{
    selection: typeof selection
    mode: typeof mode
    result: CatalogSearchResult | null
    rows: SearchResultRow[]
    error: string
  } | null>(null)
  const current = response?.selection === selection && response.mode === mode ? response : null
  const result = current?.result ?? null
  const loading = current === null
  const error = current?.error ?? ''
  const databaseRows = current?.rows ?? []
  const [cacheReady, setCacheReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    void restoreAllCachedJobs().then(() => { if (!cancelled) setCacheReady(true) })
    return () => { cancelled = true }
  }, [])
  const [previousMode, setPreviousMode] = useState(mode)
  if (previousMode !== mode) {
    setPreviousMode(mode)
    setSelection(previous => ({ ...previous, page: 1 }))
  }
  const liveJobs = useMemo(() => mode === 'all' && cacheReady ? allSessionJobs().filter(job => matchesSessionJob(job, selection.filters)) : [], [mode, selection, cacheReady])
  const bossCount = liveJobs.filter(job => !job.platform || job.platform === 'boss').length
  const zhaopinCount = liveJobs.filter(job => job.platform === 'zhaopin').length
  const liepinCount = liveJobs.filter(job => job.platform === 'liepin').length
  const sourceKind = mode === 'catalog' ? 'enterprise' : mode
  useEffect(() => {
    const controller = new AbortController()
    searchCatalog(catalogQuery(selection.filters, selection.page, sourceKind), controller.signal).then(async next => {
      const details = await getCatalogPageDetails(next.items, controller.signal)
      if (!controller.signal.aborted) {
        setResponse({ selection, mode, result: next, rows: next.items.map(job => catalogRow(job, details.get(job.id))), error: '' })
      }
    }).catch(problem => {
      if (!controller.signal.aborted) setResponse({ selection, mode, result: null, rows: [], error: catalogErrorMessage(problem) })
    })
    return () => controller.abort()
  }, [selection, sourceKind, mode])
  const apply = (filters: CatalogFilters) => {
    setSelection(previous => ({ filters: { ...filters, q: filters.q.trim() }, page: 1, attempt: previous.attempt + 1 }))
  }
  const change = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    const next = { ...draft, [key]: value }
    setDraft(next); apply(next)
  }
  const submit = (event: FormEvent) => { event.preventDefault(); apply(draft) }
  const reset = () => { setDraft({ ...emptyCatalogFilters }); apply({ ...emptyCatalogFilters }) }
  const total = (result?.total || 0) + liveJobs.length
  const pages = Math.min(10_000, Math.ceil(total / catalogPageSize))
  // Database records occupy the first segment. Append session-only records on
  // the last database page, then continue them without re-reading source sites.
  const pageStart = (selection.page - 1) * catalogPageSize
  const liveOffset = Math.max(0, pageStart - (result?.total || 0))
  const liveSlots = pageStart + databaseRows.length >= (result?.total || 0) ? catalogPageSize - databaseRows.length : 0
  const rows = [...databaseRows, ...liveJobs.slice(liveOffset, liveOffset + liveSlots).map(sessionRow)]
  const summary = [selection.filters.q ? `关键词「${selection.filters.q}」` : '全部关键词',
    catalogCities.find(([code]) => code === selection.filters.city)?.[1],
    selection.filters.degree ? degreeLabels[selection.filters.degree] : '',
    selection.filters.employmentType ? employmentLabels[selection.filters.employmentType] : '',
    selection.filters.recruitmentChannel ? channelLabels[selection.filters.recruitmentChannel] : ''].filter(Boolean).join(' · ')

  return <div className={styles.page}>
    <main className={styles.main}>
      <JobSearchHeading><div className={styles.connection}>
        <span className={styles.connectionStatus}>{mode === 'all' ? '已收录岗位与本次浏览器结果' : mode === 'announcement' ? '已收录招聘公告' : '企业官网已收录岗位'}</span>
        {mode === 'all' && <button type="button" className={styles.secondaryButton} onClick={() => onModeChange('boss')}>连接平台并读取</button>}
      </div></JobSearchHeading>
      <section className={styles.searchPanel} aria-label="岗位搜索与筛选">
        <form className={styles.searchBar} onSubmit={submit}>
          <div className={styles.searchInput}><Search size={16} aria-hidden="true" /><input aria-label="岗位或公司关键词" placeholder="岗位或公司，如 AI 产品经理" maxLength={120} value={draft.q} onChange={event => setDraft(previous => ({ ...previous, q: event.target.value }))} /></div>
          <div className={styles.cityInput}><MapPin size={16} aria-hidden="true" /><select aria-label="工作城市" value={draft.city} onChange={event => change('city', event.target.value)}>{catalogCities.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
          <button type="submit" className={styles.primaryButton}>搜索岗位</button>
        </form>
        <div className={styles.filters}>
          <label className={styles.field}>学历要求<select value={draft.degree} onChange={event => change('degree', event.target.value as CatalogFilters['degree'])}><LabelOptions labels={degreeLabels} /></select></label>
          <label className={styles.field}>行业<select disabled><option>暂不支持筛选</option></select></label>
          <label className={styles.field}>岗位方向<select disabled><option>请使用岗位关键词</option></select></label>
          <div className={styles.companyField}><span>企业类别</span><span className={styles.muted}>暂不支持筛选</span></div>
        </div>
        <div className={`${styles.secondRow} ${styles.catalogTypeFilters}`}>
          <label className={styles.field}>用工类型<select value={draft.employmentType} onChange={event => change('employmentType', event.target.value as CatalogFilters['employmentType'])}><LabelOptions labels={employmentLabels} /></select></label>
          <label className={styles.field}>招聘渠道<select value={draft.recruitmentChannel} onChange={event => change('recruitmentChannel', event.target.value as CatalogFilters['recruitmentChannel'])}><LabelOptions labels={channelLabels} /></select></label>
          {Object.values(draft).some(Boolean) && <button type="button" className={styles.resetButton} onClick={reset}><X size={14} />清除条件</button>}
        </div>
        <p className={styles.filterHint}>{mode === 'all' ? '先查询数据库已收录岗位，并合并浏览器已读取的 BOSS、智联、猎聘结果。选择招聘平台，连接并登录后可读取新岗位。' : mode === 'announcement' ? '查询数据库已收录的公共招聘公告。' : '查询数据库已收录的企业官网岗位。'}关键词可点击搜索，调整筛选时也会一起生效。</p>
      </section>
      <JobSourceSelector mode={mode} onModeChange={onModeChange} />
      <section className={styles.results} aria-labelledby="job-results-heading" aria-busy={loading}>
        <div className={styles.resultsToolbar}><div className={styles.resultsLead}>
          {mode !== 'announcement' && <OfficialAutofillAction disabled={loading || !cacheReady || Boolean(error) || total === 0}
            selectedCount={batchSelection.selectedRows.length} onCancel={batchSelection.cancel}
            selection={() => ({ type: 'selected_jobs', jobs: selectedApplicationTargets(batchSelection.selectedRows) })} />}
          <div className={styles.resultTitle}><h2 id="job-results-heading">岗位列表</h2><span aria-live="polite">{loading ? '正在查询已收录岗位…' : error ? '本次查询未完成' : result ? mode === 'all' ? `找到 ${total} 个岗位 · 数据库 ${result.total} 个 · 本次 BOSS 读取 ${bossCount} 个${zhaopinCount ? ` · 本次智联读取 ${zhaopinCount} 个` : ''}${liepinCount ? ` · 本次猎聘读取 ${liepinCount} 个` : ''}` : `当前已收录岗位中找到 ${result.total} 个岗位` : ''}</span></div>
        </div></div>
        <div className={styles.searchSummary}><p>当前查询：{summary}</p></div>
        {loading && <div className={styles.empty} role="status"><LoaderCircle size={24} className={styles.spin} /><p>正在读取岗位…</p></div>}
        {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => setSelection(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>重试查询</button></div>}
        {error && liveJobs.length > 0 && <p className={styles.detailStatus}>数据库查询尚未完成，当前可查看平台已读取的 {liveJobs.length} 个匹配岗位。</p>}
        {!loading && rows.length > 0 && <JobResults jobs={rows}
          selection={mode !== 'announcement' ? { selectedKeys: batchSelection.selectedKeys, onChange: batchSelection.toggle } : undefined} />}
        {!loading && !error && result && rows.length === 0 && <div className={styles.empty}><Search size={28} /><h3>当前收录中没有符合条件的岗位</h3><p>可以调整筛选条件。这不表示来源网站没有相关岗位。</p><button type="button" className={styles.secondaryButton} onClick={reset}>清除筛选条件</button></div>}
        <div className={styles.resultsFooter}><p><CircleHelp size={16} aria-hidden="true" />点击投递地址，打开对应岗位的官方网页。</p>
          {pages > 1 && <nav className={styles.pagination} aria-label="岗位分页"><button type="button" aria-label="上一页" disabled={selection.page <= 1 || loading} onClick={() => setSelection(previous => ({ ...previous, page: previous.page - 1 }))}><ChevronLeft size={17} /></button><span>结果页 {selection.page} / {pages}</span><button type="button" aria-label="下一页" disabled={selection.page >= pages || loading} onClick={() => setSelection(previous => ({ ...previous, page: previous.page + 1 }))}><ChevronRight size={17} /></button></nav>}
        </div>
      </section>
    </main>
  </div>
}
