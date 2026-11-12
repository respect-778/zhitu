import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { bridge, getJobNavigationSupport, subscribeJobNavigationSupport } from '@/api/jobApplication/bridge'
import { getPlatformReader, pauseForJobNavigation } from '@/api/jobApplication/api'
import { jobLink } from '@/utils/jobApplication/model'
import type { SearchResultRow } from '@/utils/jobApplication/catalogViewModel'
import styles from '@/pages/JobApplication/index.module.less'

type NavigationState = 'loading' | 'ready' | 'verification' | 'login' | 'home' | 'redirected' | 'unavailable' | 'timeout' | 'closed'
interface OpenStatus { navigationId: string; state: NavigationState }
interface Notice { job: SearchResultRow; state: NavigationState | 'opening' | 'unmonitored' | 'error'; navigationId?: string; error?: string }
const messages: Record<Notice['state'], string> = {
  opening: '后台读取已暂停，正在打开这个岗位…', loading: '正在等待 BOSS 岗位页面加载…',
  ready: '已打开岗位详情。', verification: 'BOSS 要求安全验证，请在已打开的 BOSS 页面完成验证。',
  login: 'BOSS 要求登录，请在已打开的页面完成登录。',
  home: 'BOSS 回到了首页，这个岗位尚未成功打开。', redirected: 'BOSS 跳转到了其他页面，这个岗位尚未成功打开。',
  unavailable: 'BOSS 提示该岗位已关闭或失效。', timeout: 'BOSS 页面加载超时，尚未确认打开岗位详情。',
  closed: '岗位标签页已关闭。', unmonitored: '已暂停后台读取。请在新标签页查看岗位；当前打开方式无法回传打开结果。',
  error: '岗位打开状态暂时无法确认，请检查已打开的 BOSS 标签页。',
}
function validStatus(value: OpenStatus): boolean {
  return Boolean(value && typeof value.navigationId === 'string' && ['loading', 'ready', 'verification', 'login', 'home', 'redirected', 'unavailable', 'timeout', 'closed'].includes(value.state))
}

export function useBossNavigation() {
  const supported = useSyncExternalStore(subscribeJobNavigationSupport, getJobNavigationSupport)
  const [notice, setNotice] = useState<Notice | null>(null)
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const navigationId = notice?.navigationId
    if (!navigationId) return
    let cancelled = false, checking = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = Date.now() + 120000
    const check = async () => {
      if (cancelled || checking) return
      checking = true
      try {
        const result = await bridge<OpenStatus>('JOB_OPEN_STATUS', { navigationId })
        if (cancelled || !validStatus(result) || result.navigationId !== navigationId) return
        setNotice(previous => previous?.navigationId === navigationId ? { ...previous, state: result.state, error: undefined } : previous)
        if (['loading', 'verification', 'login'].includes(result.state) && Date.now() < deadline)
          timer = setTimeout(() => { void check() }, 1500)
      } catch {
        if (!cancelled) setNotice(previous => previous?.navigationId === navigationId ? { ...previous, state: 'error' } : previous)
      } finally { checking = false }
    }
    const focus = () => { clearTimeout(timer); void check() }
    void check(); window.addEventListener('focus', focus)
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('focus', focus) }
  }, [notice?.navigationId])

  async function open(job: SearchResultRow, retry = false) {
    if (pending.current) return
    pending.current = true
    pauseForJobNavigation()
    setNotice({ job, state: 'opening' })
    try {
      const result = await bridge<OpenStatus>('OPEN_JOB', { url: job.href, retry })
      if (!validStatus(result)) throw new Error('未取得岗位打开状态，请检查 BOSS 标签页。')
      if (mounted.current) setNotice({ job, ...result })
    } catch (error) {
      if (mounted.current) setNotice({ job, state: 'error', error: error instanceof Error ? error.message : undefined })
    } finally { pending.current = false }
  }
  function handleLink(event: MouseEvent<HTMLAnchorElement>, job: SearchResultRow) {
    if (job.key.startsWith('zhaopin:') || job.key.startsWith('liepin:')) {
      getPlatformReader(job.key.startsWith('liepin:') ? 'liepin' : 'zhaopin').pauseForJobNavigation(); return
    }
    if (!job.key.startsWith('boss:') || !jobLink(job.href || '') || (event.type === 'auxclick' && event.button !== 1)) return
    if (!supported || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      pauseForJobNavigation(); setNotice({ job, state: 'unmonitored' }); return
    }
    event.preventDefault()
    void open(job)
  }
  async function focus() {
    const navigationId = notice?.navigationId
    if (!navigationId) return
    try {
      const result = await bridge<OpenStatus>('FOCUS_JOB', { navigationId })
      if (validStatus(result)) setNotice(previous => previous?.navigationId === navigationId ? { ...previous, state: result.state, error: undefined } : previous)
    } catch { setNotice(previous => previous?.navigationId === navigationId ? { ...previous, state: 'error' } : previous) }
  }
  const retryable = notice && ['verification', 'login', 'home', 'redirected', 'timeout', 'closed', 'error'].includes(notice.state)
  return {
    handleLink,
    notice: notice && <div className={styles.navigationNotice} role="status" aria-label="BOSS 岗位打开状态" aria-live="polite">
      <div><strong>{notice.job.title}</strong><p>{notice.error || messages[notice.state]}</p></div>
      <div className={styles.navigationActions}>
        {notice.navigationId && notice.state !== 'closed' && <button type="button" onClick={() => { void focus() }}>查看 BOSS 页面</button>}
        {retryable && <button type="button" onClick={() => { void open(notice.job, true) }}>{['verification', 'login'].includes(notice.state) ? '完成验证或登录后重试' : '重试这个岗位'}</button>}
        <button type="button" aria-label="收起岗位打开提示" onClick={() => setNotice(null)}>收起</button>
      </div>
    </div>,
  }
}
