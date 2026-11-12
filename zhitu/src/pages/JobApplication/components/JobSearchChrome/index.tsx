import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import styles from '@/pages/JobApplication/index.module.less'

export type JobSourceMode = 'all' | 'boss' | 'zhaopin' | 'liepin' | 'catalog' | 'announcement'
export interface SourceSelectorProps {
  mode: JobSourceMode
  onModeChange: (mode: JobSourceMode) => void
  enabled?: boolean
  onToggle?: () => void
}

export function JobSearchHeading({ children }: { children?: ReactNode }) {
  return <div className={styles.pageHeading}><div><h1>网申投递</h1><p>按条件查找岗位，直达招聘详情</p></div>{children}</div>
}

const sources: { name: string; subtitle: string; logo: string; mode?: JobSourceMode }[] = [
  { name: '全部', subtitle: '已收录与本次读取', logo: '', mode: 'all' },
  { name: '企业官网', subtitle: '企业官方发布', logo: '', mode: 'catalog' },
  { name: '人社', subtitle: '已收录招聘公告', logo: 'mohrss.jpeg', mode: 'announcement' },
  { name: 'BOSS直聘', subtitle: '招聘平台', logo: 'boss.ico', mode: 'boss' },
  { name: '前程无忧', subtitle: '招聘平台', logo: '51job.ico' },
  { name: '智联招聘', subtitle: '招聘平台', logo: 'zhaopin.jpg', mode: 'zhaopin' },
  { name: '猎聘网', subtitle: '招聘平台', logo: 'liepin.ico', mode: 'liepin' },
]

export function JobSourceSelector({ mode, onModeChange, enabled = true, onToggle }: SourceSelectorProps) {
  return <section className={styles.sourceSection} aria-labelledby="job-sources-heading">
    <div className={styles.sectionLabel}><h2 id="job-sources-heading">招聘来源</h2><span>先查询已收录岗位，连接平台后可读取新岗位</span></div>
    <div className={styles.sources}>{sources.map(source => {
      const selected = source.mode === mode && enabled
      return <button type="button" key={source.name} disabled={!source.mode}
        aria-label={`${source.name}${source.mode ? '' : '，暂未接入'}`} aria-pressed={source.mode ? selected : undefined}
        className={`${styles.source} ${selected ? styles.sourceSelected : ''}`}
        onClick={() => { if (source.mode === mode) onToggle?.(); else if (source.mode) onModeChange(source.mode) }}>
        {source.logo ? <img className={styles.sourceLogo} src={`/imgs/job-sources/${source.logo}`} alt={`${source.name}标志`} /> : <span className={styles.officialBadge} aria-hidden="true">{source.mode === 'all' ? '全部' : '官网'}</span>}
        <span className={styles.sourceText}><strong>{source.name}</strong><small>{source.mode ? source.subtitle : '暂未接入'}</small></span>
        {source.mode && <span className={styles.sourceCheck}>{selected && <Check size={13} strokeWidth={2.4} />}</span>}
      </button>
    })}</div>
  </section>
}
