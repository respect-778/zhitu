import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadUserResumes } from '@/store/modules/resumeStore'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Globe2, LoaderCircle, MapPin, RefreshCw, Search, X } from 'lucide-react'
import { effectiveFilters, initialFilters, sameQuery, salaryConversionDescription, salarySortDescription, getPlatformReader, type Catalogue, type Filters, type ReaderStatus } from '@/api/jobApplication/api'
import { companyCategories } from '@/utils/jobApplication/companies'
import styles from '@/pages/JobApplication/index.module.less'
import JobResults from '@/pages/JobApplication/components/JobResults/index'
import { sessionRow } from '@/utils/jobApplication/catalogViewModel'
import CatalogJobSearch from '@/pages/JobApplication/components/CatalogJobSearch/index'
import JobBatchAction from '@/pages/JobApplication/components/JobBatchAction/index'
import { platformJobTargets } from '@/api/jobApplication/jobActions'
import { platformNames, platformFullNames, type JobPlatform } from '@/utils/jobApplication/platforms'
import { isAgentDevelopmentSearch } from '@/utils/jobApplication/jobKeywords'
import { useJobSelection } from '@/hooks/jobApplication/useJobSelection'
import { JobSearchHeading, JobSourceSelector, type JobSourceMode } from '@/pages/JobApplication/components/JobSearchChrome/index'

const commonCities = ['全国', '北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '苏州', '西安']
const industries = ['互联网', '人工智能', '制造业', '金融', '教育培训', '医疗健康', '电子商务', '新能源']
const roles = ['产品经理', '软件开发', '数据分析', '运营', '设计', '市场', '财务', '人力资源']
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。'

function Options({ values, empty = '不限' }: { values: string[]; empty?: string }) {
  return <><option value="">{empty}</option>{values.map(value => <option key={value} value={value}>{value}</option>)}</>
}

function storedSort(platform: JobPlatform) {
  try {
    const value = localStorage.getItem(`knowvia-job-sort:${platform}`)
    if (value && ['salary_desc', 'newest', 'source', 'company'].includes(value)) return value
  } catch { /* Sorting remains available when browser storage is disabled. */ }
  return initialFilters.sort
}

export default function JobSearch() {
  const dispatch = useAppDispatch()
  const userId = useAppSelector(state => state.user.userId)
  const storageUserId = useAppSelector(state => state.resume.storageUserId)
  useEffect(() => { if (storageUserId !== userId) dispatch(loadUserResumes(userId)) }, [dispatch, userId, storageUserId])
  const [params, setParams] = useSearchParams()
  const source = params.get('source')
  const mode: JobSourceMode = source === 'boss' || source === 'zhaopin' || source === 'liepin' || source === 'catalog' || source === 'announcement' ? source : 'all'
  const changeMode = (next: JobSourceMode) => {
    if (mode === 'boss' || mode === 'zhaopin' || mode === 'liepin') getPlatformReader(mode).setReaderEnabled(false)
    setParams(previous => {
      const updated = new URLSearchParams(previous)
      if (next === 'all') updated.delete('source')
      else updated.set('source', next)
      return updated
    })
  }
  return mode === 'boss' || mode === 'zhaopin' || mode === 'liepin' ? <PlatformJobSearch key={mode} platform={mode} onModeChange={changeMode} /> : <CatalogJobSearch mode={mode} onModeChange={changeMode} />
}

function PlatformJobSearch({ platform, onModeChange }: { platform: JobPlatform; onModeChange: (mode: JobSourceMode) => void }) {
  const { request, listJobs, sessionJobs, setReaderEnabled } = getPlatformReader(platform)
  const sourceName = platformNames[platform]
  useEffect(() => {
    setReaderEnabled(true)
    return () => setReaderEnabled(false)
  }, [setReaderEnabled])
  const [filters, setFilters] = useState<Filters>(() => ({ ...initialFilters, sort: storedSort(platform) }))
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [status, setStatus] = useState<ReaderStatus | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [error, setError] = useState('')
  const [queryError, setQueryError] = useState('')
  const [notice, setNotice] = useState('')
  const [maxPages, setMaxPages] = useState('10')
  const [refresh, setRefresh] = useState(0)
  const requestVersion = useRef(0)
  const revision = useRef(-1)
  const restoredQuery = useRef(false)
  const selectionScope = JSON.stringify(effectiveFilters({ ...filters, sort: '' }))
  const selection = useJobSelection(selectionScope)

  const change = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    if (key === 'sort') {
      try { localStorage.setItem(`knowvia-job-sort:${platform}`, value) } catch { /* Keep the current selection in memory. */ }
    }
    setFilters(previous => ({ ...previous, [key]: value }))
    setPage(1)
  }

  const refreshStatus = useCallback(async (force = false) => {
    const next = await request<ReaderStatus>('/status', { refresh: force })
    setStatus(next)
    setCollecting(next.busy)
    if (!restoredQuery.current) {
      restoredQuery.current = true
      if (next.query) setFilters(previous => ({ ...previous, ...next.query, sort: storedSort(platform) }))
    }
    if (next.revision !== revision.current) {
      revision.current = next.revision
      setRefresh(value => value + 1)
    }
  }, [request, platform])

  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.source === window && event.origin === location.origin && event.data?.channel === 'knowvia-jobs-ready') {
        void refreshStatus(true)
      }
    }
    window.addEventListener('message', ready)
    return () => window.removeEventListener('message', ready)
  }, [refreshStatus])

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try { if (!cancelled) await refreshStatus() } catch (problem) {
        if (!cancelled) setError(errorMessage(problem))
      }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, collecting ? 1500 : 7000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [collecting, refreshStatus])

  useEffect(() => {
    const version = ++requestVersion.current
    if (!enabled) { setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(() => {
      listJobs(filters, page).then(result => {
        if (version !== requestVersion.current) return
        setCatalogue(result)
        setQueryError('')
      }).catch(problem => {
        if (version === requestVersion.current) { setQueryError(errorMessage(problem)); setCatalogue(null) }
      }).finally(() => { if (version === requestVersion.current) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); requestVersion.current = version + 1 }
  }, [filters, page, enabled, refresh, listJobs])

  const searchCatalogue = (event: FormEvent) => {
    event.preventDefault(); void collect(false)
  }

  const connect = async () => {
    setConnecting(true); setError(''); setNotice(`正在连接当前浏览器中的 ${sourceName}…`)
    try {
      const result = await request<{ message: string }>('/browser/start', {})
      setNotice(result.message)
      await refreshStatus()
    } catch (problem) { setError(errorMessage(problem)); setNotice('') }
    finally { setConnecting(false) }
  }

  const collect = async (continueSearch = false, refresh = false) => {
    if (!filters.keyword.trim()) { setError('请先输入要读取的岗位关键词，例如「AI 产品经理」。'); return }
    if (filters.salary_min && filters.salary_max && Number(filters.salary_min) > Number(filters.salary_max)) { setError('薪资下限不能高于上限。'); return }
    setError(''); setNotice(''); setCollecting(true)
    try {
      const query = effectiveFilters({ ...filters, keyword: filters.keyword.trim() })
      setFilters(query)
      await request('/collect', { ...query, max_pages: Number(maxPages), continue_search: continueSearch, refresh })
      if (!continueSearch) { selection.cancel(); setPage(1); setCatalogue(null) }
      await refreshStatus()
    } catch (problem) {
      setCollecting(false); setError(errorMessage(problem))
    }
  }

  const stop = async () => {
    try { await request('/collect/stop', {}); await refreshStatus() }
    catch (problem) { setError(errorMessage(problem)) }
  }
  const reset = () => { setFilters(previous => ({ ...initialFilters, keyword: previous.keyword, city: previous.city })); setPage(1); setError(''); setQueryError(''); setEnabled(true) }
  const cities = [...new Set([...commonCities, ...(status?.cities || [])])]
  const total = enabled ? catalogue?.total || 0 : 0
  const jobs = enabled ? catalogue?.items || [] : []
  const selectedCount = Object.entries(filters).filter(([key, value]) =>
    !['keyword', 'city', 'sort', 'salary_unit'].includes(key) && value !== '').length
  const displayedError = queryError || error
  const invalidSalary = Boolean(filters.salary_min && filters.salary_max && Number(filters.salary_min) > Number(filters.salary_max))
  const activeQuery = status?.query
  const queryChanged = activeQuery && !sameQuery(activeQuery, filters)
  const canContinue = status?.resumable && !queryChanged
  const resumeLabel = status?.run.stop_reason === 'page_limit' ? '继续读取' : '恢复读取'
  const readFailed = status?.run.stop_reason === 'error'
  const skippedCount = status?.run.skipped_count || 0
  const detailCounts = status?.detail_counts
  const detailsPending = detailCounts ? detailCounts.unread + detailCounts.reading + detailCounts.partial + detailCounts.error : 0

  return <div className={styles.page}>
    <main className={styles.main}>
      <JobSearchHeading>
        <div className={styles.connection}>
          <span className={styles.connectionStatus}><span className={status?.browser_running ? styles.connectedDot : styles.idleDot} />{status?.browser_running ? '当前浏览器已连接' : status?.extension_installed ? '助手已连接' : '等待浏览器助手'}</span>
          <button type="button" className={styles.secondaryButton} onClick={() => { void connect() }} disabled={connecting || collecting}>
            {connecting ? <LoaderCircle size={16} className={styles.spin} /> : <Globe2 size={16} />}{connecting ? '正在打开' : status?.browser_running ? `打开 ${sourceName}` : `连接 ${sourceName}`}
          </button>
        </div>
      </JobSearchHeading>

      {status && !status.extension_installed && <details className={styles.connectionGuide}>
        <summary>先连接你正在使用的浏览器</summary>
        <p>在当前 Chrome 或 Edge 安装一次「Knowvia 岗位读取助手」，之后 {sourceName} 登录、搜索和岗位详情都在这个浏览器中打开。</p>
        <ol><li>打开浏览器的扩展管理页：Chrome 输入 <code>chrome://extensions</code>，Edge 输入 <code>edge://extensions</code>。</li>
          <li>开启“开发者模式”，点击“加载已解压的扩展程序”，选择本项目中的 <code>zhitu/extensions/jobApplication</code> 文件夹。</li>
          <li>刷新本页，点击“连接 {sourceName}”，在新标签页登录，然后返回这里搜索。</li></ol>
        <p>当前本地版支持 Chrome、Edge。内置预览浏览器请改用上述浏览器打开 <a href="http://127.0.0.1:5186/applications">本地官网</a>。</p>
      </details>}

      <section className={styles.searchPanel} aria-label="岗位搜索与筛选">
        <form className={styles.searchBar} onSubmit={searchCatalogue}>
          <div className={styles.searchInput}><Search size={16} aria-hidden="true" /><input aria-label="岗位或公司关键词" placeholder="岗位或公司，如 AI 产品经理" maxLength={100} value={filters.keyword} onChange={event => change('keyword', event.target.value)} /></div>
          <div className={styles.cityInput}><MapPin size={16} aria-hidden="true" /><select aria-label="工作城市" value={filters.city} onChange={event => change('city', event.target.value)}>{cities.map(city => <option key={city}>{city}</option>)}</select></div>
          <button type="submit" className={styles.primaryButton} disabled={!enabled || collecting || connecting}>{status?.details_busy ? '正在完善详情…' : collecting ? '正在搜索…' : '搜索岗位'}</button>
        </form>

        <div className={styles.filters}>
          <label className={styles.field}>学历要求<select value={filters.education} onChange={event => change('education', event.target.value)}><Options values={['大专', '本科', '硕士', '博士']} /></select></label>
          <label className={styles.field}>行业<select value={filters.industry} onChange={event => change('industry', event.target.value)}><Options values={industries} /></select></label>
          <label className={styles.field}>岗位方向<select value={roles.includes(filters.keyword) ? filters.keyword : ''} onChange={event => change('keyword', event.target.value)}><Options values={roles} empty={filters.keyword && !roles.includes(filters.keyword) ? '自定义' : '不限'} /></select></label>
          <div className={styles.companyField}><span>企业类别</span><div className={styles.chips} role="group" aria-label="企业类别">{companyCategories.map(value => <button type="button" key={value} aria-pressed={filters.company_type === value} className={filters.company_type === value ? styles.selectedChip : styles.chip} onClick={() => change('company_type', value)}>{value || '不限'}</button>)}</div></div>
        </div>

        <div className={styles.secondRow}>
          <div className={styles.typeFilter}><span>招聘类型</span><div className={styles.chips} role="group" aria-label="招聘类型">{['', '实习', '校招', '社招'].map(value => <button type="button" key={value} aria-pressed={filters.job_type === value} className={filters.job_type === value ? styles.selectedChip : styles.chip} onClick={() => { change('job_type', value); change('graduate_year', ''); change('experience', '') }}>{value || '不限'}</button>)}</div></div>
          {selectedCount > 0 && <button type="button" className={styles.resetButton} onClick={reset}><X size={14} />清除条件 ({selectedCount})</button>}
        </div>

        <p className={styles.filterHint}>学历按岗位要求精确匹配；招聘类型为“不限”时，含“实习”的关键词会自动选择实习</p>
        {platform !== 'boss' && isAgentDevelopmentSearch(filters.keyword) && <p className={styles.filterHint}>按 Agent 主题检索，并核对岗位的实际开发职责。</p>}
        <div className={styles.additionalFilters}>
          {filters.job_type === '校招' ? <label className={styles.field}>毕业届数<select value={filters.graduate_year} onChange={event => change('graduate_year', event.target.value)}><Options values={Array.from({ length: 4 }, (_, index) => String(new Date().getFullYear() - 1 + index))} /></select></label>
            : <label className={styles.field}>经验要求<select value={filters.experience} onChange={event => change('experience', event.target.value)}><Options values={['经验不限', '在校', '应届', '1年以内', '1-3年', '3-5年', '5-10年']} /></select></label>}
          <fieldset className={styles.salary}><legend>薪资范围</legend><input aria-label="最低薪资" type="number" min="0" placeholder="最低" value={filters.salary_min} onChange={event => change('salary_min', event.target.value)} /><span>—</span><input aria-label="最高薪资" type="number" min="0" placeholder="最高" value={filters.salary_max} onChange={event => change('salary_max', event.target.value)} /><select aria-label="薪资单位" value={filters.salary_unit} onChange={event => change('salary_unit', event.target.value)}><option value="月">元 / 月</option><option value="天">元 / 天</option></select></fieldset>
        </div>
        {(filters.salary_min || filters.salary_max) && <p className={styles.filterHint}>{salaryConversionDescription}薪资区间有重叠的岗位会保留。</p>}
      </section>

      <JobSourceSelector mode={platform} onModeChange={onModeChange} enabled={enabled} onToggle={() => { selection.cancel(); setEnabled(value => !value); setPage(1) }} />

      <section className={styles.results} aria-labelledby="job-results-heading" aria-busy={loading}>
        <div className={styles.resultsToolbar}>
          <div className={styles.resultsLead}>
            <JobBatchAction key={selectionScope} action="greet" disabled={!enabled || total === 0}
              selecting={selection.active} selectedCount={selection.selectedRows.length} onStart={selection.start} onCancel={selection.cancel}
              selection={() => ({ type: 'platform_jobs', jobs: platformJobTargets(sessionJobs().filter(job => selection.selectedKeys.has(`${platform}:${job.id}`))) })} />
            <div className={styles.resultTitle}><h2 id="job-results-heading">岗位列表</h2><span aria-live="polite">找到 {total} 个岗位{status?.run.raw_count ? ` · ${sourceName} 返回 ${status.run.raw_count} 条` : ''}{status?.run.pages_read ? ` · 已读取 ${status.run.pages_read} 页` : ''}</span></div>
          </div>
          <div className={styles.resultActions}>
            <select aria-label="岗位排序" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="salary_desc">薪资从高到低</option><option value="newest">最新岗位优先</option><option value="source">{sourceName} 返回顺序</option><option value="company">按公司排列</option></select>
            <label className={styles.readCount}>每轮最多<select aria-label="读取页数" disabled={collecting} value={maxPages} onChange={event => setMaxPages(event.target.value)}>{['1', '3', '5', '10', '20', '50'].map(value => <option key={value} value={value}>{value} 页</option>)}</select></label>
            {collecting ? <button type="button" className={styles.readButton} onClick={() => { void stop() }}><X size={15} />停止读取</button>
              : canContinue ? <button type="button" className={styles.readButton} disabled={connecting || !enabled} onClick={() => { void collect(true) }}><RefreshCw size={15} />{resumeLabel}</button> : null}
            {!collecting && <button type="button" className={styles.readButton} disabled={connecting || !enabled || !filters.keyword.trim()} onClick={() => { void collect(false, true) }}><RefreshCw size={15} />读取最新</button>}
          </div>
        </div>

        {filters.sort === 'newest' && <p className={styles.detailStatus}>按平台披露的发布或更新时间从新到旧排列，未披露时间的岗位排在最后。</p>}

        <details className={styles.resultGuide}><summary><CircleHelp size={16} aria-hidden="true" />排序与岗位信息说明<ChevronDown size={16} aria-hidden="true" /></summary>
          {filters.sort === 'salary_desc' && <p>{salarySortDescription}</p>}
          <p>岗位详情会自动补全。未获取到的岗位信息统一显示“未知”。</p>
        </details>
        {status?.extension_outdated && <p className={styles.notice}>当前助手版本暂不兼容，请由维护人员同步版本。你无需操作浏览器扩展管理页。</p>}
        {status?.extension_updating && <p className={styles.notice}>浏览器助手正在更新，完成后会自动重连，已读取的岗位会保留。</p>}
        {status?.detail_message && <p className={styles.detailStatus} role="status">{status.detail_message}</p>}
        {status?.cache_error && <p className={styles.error} role="alert">{status.cache_error}</p>}
        {detailCounts && detailCounts.complete + detailsPending > 0 && <p className={styles.detailStatus}>详情已核验 {detailCounts.complete} 个，待核验 {detailsPending} 个</p>}
        {displayedError && <div className={styles.error} role="alert"><span>{displayedError}</span>{invalidSalary
          ? <button type="button" onClick={() => { change('salary_min', ''); change('salary_max', ''); setQueryError('') }}>清除薪资条件</button>
          : <button type="button" onClick={() => { setQueryError(''); void connect() }}>重试连接</button>}</div>}
        {notice && !displayedError && <p className={styles.notice} role="status">{notice}</p>}
        {activeQuery && <div className={styles.searchSummary}>
          <p>本次搜索：<strong>{activeQuery.keyword}</strong> · {[activeQuery.city, activeQuery.education, activeQuery.industry, activeQuery.company_type, activeQuery.job_type, activeQuery.graduate_year && `${activeQuery.graduate_year}届`, activeQuery.experience].filter(Boolean).join(' · ')}{queryChanged && <span> · 条件已修改，点击“搜索岗位”获取新结果</span>}</p>
          <p role="status">{status?.run.message}</p>
          {readFailed && <button type="button" className={styles.readButton} disabled={connecting} onClick={() => { void connect() }}>查看 {sourceName} 页面</button>}
          {skippedCount > 0 && <p role="status">有 {skippedCount} 条数据缺少有效岗位链接，已跳过；其余有效岗位正常展示，本次结果可能不完整。</p>}
        </div>}

        {jobs.length > 0 ? <JobResults jobs={jobs.map(sessionRow)} sort={filters.sort}
          selection={selection.active ? { selectedKeys: selection.selectedKeys, onChange: selection.toggle } : undefined} /> : <div className={styles.empty}>
          {loading || collecting ? <LoaderCircle size={30} className={styles.spin} /> : <Search size={30} strokeWidth={1.4} />}
          <h3>{loading || collecting ? '正在查询岗位' : !enabled ? '请选择招聘来源' : invalidSalary ? '请调整薪资范围' : displayedError ? '暂时无法加载岗位' : readFailed ? '本次岗位读取未完成' : skippedCount ? '暂未获得可展示的岗位' : activeQuery ? '没有符合条件的岗位' : '从一个岗位关键词开始'}</h3>
          <p>{loading || collecting ? '岗位按页显示，读取过程中也可以查看。' : !enabled ? `选择 ${platformFullNames[platform]}后搜索岗位。` : invalidSalary ? '最低薪资需要小于或等于最高薪资。' : displayedError ? '请恢复连接后重试。' : readFailed ? '读取遇到问题，请查看上方提示后重新搜索。' : skippedCount ? '部分数据缺少有效岗位链接，暂时无法确认是否有更多匹配岗位。' : activeQuery ? '可调整关键词、城市或筛选条件后重新搜索。' : `连接并登录 ${sourceName}，输入关键词后点击「搜索岗位」，实时获取平台结果。`}</p>
          {!loading && !collecting && selectedCount > 0 && !displayedError && !readFailed && !skippedCount && <button type="button" className={styles.secondaryButton} onClick={reset}>清除筛选条件</button>}
        </div>}

        <div className={styles.resultsFooter}><p><CircleHelp size={16} aria-hidden="true" />已读取岗位保存在当前浏览器，重新打开后可继续查看。点击投递地址查看职位详情并投递。</p>
          {total > 20 && <nav className={styles.pagination} aria-label="岗位分页"><button type="button" aria-label="上一页" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /></button><span>结果页 {page} / {Math.ceil(total / 20)}</span><button type="button" aria-label="下一页" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage(value => value + 1)}><ChevronRight size={17} /></button></nav>}
        </div>
      </section>
    </main>
  </div>
}
