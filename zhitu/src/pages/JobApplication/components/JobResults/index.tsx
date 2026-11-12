import type { MouseEvent, ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { SearchResultRow } from '@/utils/jobApplication/catalogViewModel'
import styles from '@/pages/JobApplication/index.module.less'
import { useBossNavigation } from '@/hooks/jobApplication/useBossNavigation'

function ResultLink({ job, children, onNavigate }: { job: SearchResultRow; children: ReactNode; onNavigate: (event: MouseEvent<HTMLAnchorElement>, job: SearchResultRow) => void }) {
  return job.href ? <a href={job.href} title={job.source} target="_blank" rel="noopener noreferrer" onClick={event => onNavigate(event, job)} onAuxClick={event => onNavigate(event, job)} className={styles.externalLink}>{children}<ArrowUpRight size={14} aria-hidden="true" /></a>
    : <span className={styles.muted}>{children}</span>
}

interface ResultSelection {
  selectedKeys: ReadonlySet<string>
  onChange: (jobs: SearchResultRow[], checked: boolean) => void
}

function PageCheckbox({ jobs, selection }: { jobs: SearchResultRow[]; selection: ResultSelection }) {
  const selectedCount = jobs.filter(job => selection.selectedKeys.has(job.key)).length
  return <input type="checkbox" className={styles.jobCheckbox} aria-label="全选本页岗位"
    checked={jobs.length > 0 && selectedCount === jobs.length}
    ref={node => { if (node) node.indeterminate = selectedCount > 0 && selectedCount < jobs.length }}
    onChange={event => selection.onChange(jobs, event.target.checked)} />
}

export default function JobResults({ jobs, sort, selection }: { jobs: SearchResultRow[]; sort?: string; selection?: ResultSelection }) {
  const navigation = useBossNavigation()
  return <>
    {navigation.notice}
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="岗位结果表格，可横向滚动">
      <table className={`${styles.table} ${selection ? styles.selectableTable : ''}`}>
        <thead><tr>{selection && <th scope="col" className={styles.selectionCell}><PageCheckbox jobs={jobs} selection={selection} /></th>}{['职位', '薪资', '公司名称', '企业类别', '行业类别', '城市', '学历要求', '届数', '截止时间', '投递地址'].map(name => <th key={name} scope="col" aria-sort={name === '薪资' && sort === 'salary_desc' ? 'descending' : undefined}>{name}</th>)}</tr></thead>
        <tbody>{jobs.map(job => <tr key={job.key} className={selection?.selectedKeys.has(job.key) ? styles.selectedJob : undefined}>
          {selection && <td className={styles.selectionCell}><input type="checkbox" className={styles.jobCheckbox}
            aria-label={`选择 ${job.company} · ${job.title}`} checked={selection.selectedKeys.has(job.key)}
            onChange={event => selection.onChange([job], event.target.checked)} /></td>}
          <td><div className={styles.jobTitle}><ResultLink job={job} onNavigate={navigation.handleLink}>{job.title}</ResultLink></div><div className={styles.jobMeta}><span>{job.jobType}</span></div>{job.matchReason && <p className={styles.matchReason} title={job.matchReason}>职责匹配 {job.matchReason}</p>}</td>
          <td className={styles.salaryValue}>{job.salary}</td>
          <td className={styles.companyName}>{job.company}</td>
          <td>{job.companySource ? <a className={styles.companyTag} href={job.companySource} target="_blank" rel="noopener noreferrer" title={job.companyFocus}>{job.companyType} ↗</a> : <span className={styles.muted}>{job.companyType}</span>}</td>
          <td>{job.industry}</td><td>{job.city}</td><td title={job.educationRaw}>{job.education}</td>
          <td title={job.graduationHint}>{job.graduateYearLabel ?? (job.graduateYear ? `${job.graduateYear}届` : '未知')}</td><td className={styles.date}>{job.deadline}</td>
          <td>{job.href ? <ResultLink job={job} onNavigate={navigation.handleLink}>{job.linkLabel}</ResultLink> : <span className={styles.muted}>未知</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className={styles.mobileJobs}>
      {selection && <label className={styles.mobilePageSelection}><PageCheckbox jobs={jobs} selection={selection} />全选本页岗位</label>}
      {jobs.map(job => <article key={job.key} className={`${styles.mobileJob} ${selection?.selectedKeys.has(job.key) ? styles.selectedJob : ''}`}>
      {selection && <label className={styles.mobileRowSelection}><input type="checkbox" className={styles.jobCheckbox}
        aria-label={`选择 ${job.company} · ${job.title}`} checked={selection.selectedKeys.has(job.key)}
        onChange={event => selection.onChange([job], event.target.checked)} />选择此岗位</label>}
      <div className={styles.mobileTitle}><h3>{job.title}</h3><strong>{job.salary}</strong></div>
      <p>{job.company}</p><div className={styles.mobileMeta}><span>{job.city}</span><span title={job.educationRaw}>{job.education}</span><span>{job.jobType}</span></div>
      {job.matchReason && <p className={styles.matchReason} title={job.matchReason}>职责匹配 {job.matchReason}</p>}
      <dl><div><dt>企业类别</dt><dd>{job.companyType}</dd></div><div><dt>行业</dt><dd>{job.industry}</dd></div><div><dt>截止时间</dt><dd>{job.deadline}</dd></div><div><dt>届数</dt><dd title={job.graduationHint}>{job.graduateYearLabel ?? (job.graduateYear ? `${job.graduateYear}届` : '未知')}</dd></div></dl>
      {job.href ? <ResultLink job={job} onNavigate={navigation.handleLink}>{job.linkLabel}</ResultLink> : <span className={styles.muted}>未知</span>}
    </article>)}</div>
  </>
}
