import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { autofillProfiles } from '@/utils/jobApplication/autofillProfiles'
import { cancelAutofill, currentAutofillTaskId, getAutofillStatus } from '@/api/jobApplication/autofillClient'
import { bridge } from '@/api/jobApplication/bridge'
import { requestJobAction, type JobActionSelection } from '@/api/jobApplication/jobActions'
import type { AutofillResumeChoice, AutofillTaskStatus } from '@/types/jobApplication/autofillTypes'
import EmailApplicationPanel from '@/pages/JobApplication/components/EmailApplicationPanel/index'
import type { EmailApplication } from '@/api/jobApplication/emailApplications'
import styles from '@/pages/JobApplication/index.module.less'
import autofillStyles from '@/pages/JobApplication/components/OfficialAutofillAction/index.module.less'

function fieldLabel(field: string) {
  const labels: Record<string, string> = { name: '姓名', phone: '手机号', email: '邮箱', age: '年龄', birthDate: '出生日期',
    school: '学校', major: '专业', degree: '学历', startDate: '入学时间', endDate: '毕业时间', dates: '就读时间', form: '申请表' }
  const education = field.match(/^education\.(\d+)(?:\.(.+))?$/)
  if (education) {
    const [key, component] = (education[2] || '').split('.')
    const suffix = component === 'year' ? '年份' : component === 'month' ? '月份' : ''
    return `教育经历 ${Number(education[1]) + 1}${key ? ` · ${labels[key] || '字段'}${suffix}` : ''}`
  }
  return field.startsWith('required.') ? '其他必填项' : labels[field] || '待核验字段'
}

export default function OfficialAutofillAction({ selection, disabled, selectedCount, onCancel }: {
  selection: () => JobActionSelection
  disabled: boolean
  selectedCount: number
  onCancel: () => void
}) {
  const [resumes, setResumes] = useState<AutofillResumeChoice[]>([])
  const [resumeId, setResumeId] = useState('')
  const [task, setTask] = useState<AutofillTaskStatus | null>(null)
  const [taskId, setTaskId] = useState<string | null>(currentAutofillTaskId)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [emails, setEmails] = useState<EmailApplication[]>([])
  const [emailBusy, setEmailBusy] = useState(false)
  const submitting = useRef(false)
  const resumeSelect = useRef<HTMLSelectElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    try {
      const provider = autofillProfiles()
      const refresh = () => {
        const next = provider.choices()
        setResumes(next.resumes)
        setResumeId(previous => next.resumes.some(item => item.id === previous) ? previous
          : next.activeId || (next.resumes.length === 1 ? next.resumes[0].id : ''))
      }
      refresh()
      return provider.subscribe(refresh)
    } catch { setMessage('简历资料尚未就绪，请重新打开页面。') }
  }, [])
  useEffect(() => {
    if (!taskId) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function update() {
      try {
        const next = await getAutofillStatus(taskId!)
        if (disposed) return
        setTask(next)
        if (next.state === 'running') timer = setTimeout(() => { void update() }, 1500)
      } catch (error) {
        if (!disposed) {
          setMessage(error instanceof Error ? error.message : '填写进度读取失败，请重新连接浏览器助手。')
          setTask(null); setTaskId(null)
        }
      }
    }
    void update()
    return () => { disposed = true; clearTimeout(timer) }
  }, [taskId])
  async function start() {
    if (submitting.current) return
    if (!selectedCount) {
      setMessage('请先勾选要投递的岗位，再选择填写简历。')
      return
    }
    if (!resumeId) {
      setMessage(resumes.length ? '请选择一份用于填写的简历。' : '请先创建或导入简历，保存后回到这里选择。')
      resumeSelect.current?.focus()
      return
    }
    submitting.current = true; setPending(true); setMessage('')
    try {
      const result = await requestJobAction({ version: 1, operationId: crypto.randomUUID(), action: 'apply',
        selection: selection(), resumeVersionId: resumeId })
      if (!mounted.current) {
        if (result.status === 'accepted') await cancelAutofill(result.taskId).catch(() => {})
        return
      }
      if (result.status === 'blocked') setMessage(result.message)
      else {
        setEmails(result.emails || [])
        if (result.status === 'accepted') { setTask(null); setTaskId(result.taskId) }
        else { setTask(null); setTaskId(null); setMessage(result.message || '已按官网邮箱准备邮件，请核对附件并发送。') }
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '暂时无法发起填写，请稍后重试。') }
    finally { submitting.current = false; setPending(false) }
  }
  async function cancel() {
    if (!taskId) return
    try { setTask(await cancelAutofill(taskId)); setTaskId(null); setMessage('填写已取消。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '取消未确认，请检查浏览器助手。') }
  }
  return <div className={`${styles.batchAction} ${autofillStyles.panel}`}>
    <div className={styles.batchControls}>
      <button type="button" className={styles.batchButton} disabled={disabled || pending || emailBusy || task?.state === 'running'} onClick={() => { void start() }}>一键投递</button>
      <span className={styles.selectionCount} aria-live="polite">已选 {selectedCount} 个岗位</span>
      {selectedCount > 0 && <button type="button" className={styles.cancelSelection} disabled={pending || emailBusy} onClick={onCancel}>清空选择</button>}
      <label>填写简历 <select ref={resumeSelect} aria-label="填写简历" value={resumeId} disabled={pending || emailBusy || task?.state === 'running'} onChange={event => { setResumeId(event.target.value); setEmails([]) }}>
        <option value="">{resumes.length ? '请选择简历' : '请先保存简历'}</option>
        {resumes.map(resume => <option value={resume.id} key={resume.id}>{resume.title || '未命名简历'}</option>)}
      </select></label>
      {resumes.length === 0 && <Link to="/resume" className={styles.cancelSelection}>创建或导入简历</Link>}
    </div>
    <p>勾选岗位并选择简历后开始填写，支持 Moka、飞书招聘和北森企业招聘页。登录后自动继续，最终提交请在官网确认。已核对的邮箱岗位会生成邮件，附上当前简历后发送。</p>
    {message && <p role="status">{message}</p>}
    {emails.length > 0 && <EmailApplicationPanel applications={emails} onBusyChange={setEmailBusy} />}
    {task && <div aria-label="官网填写进度" aria-live="polite">
      {task.state === 'running' && <button type="button" className={styles.cancelSelection} onClick={() => { void cancel() }}>停止填写</button>}
      <ul>{task.jobs.map(job => <li key={job.jobId}>
        <span>{job.company} · {job.title} · {job.message}</span>{' '}
        <button type="button" className={styles.cancelSelection} onClick={() => { void bridge('AUTOFILL_FOCUS', { taskId: task.taskId, jobId: job.jobId }).catch(() => setMessage('官网标签页已关闭，请重新发起。')) }}>查看官网</button>
        {job.fields.length > 0 && <details><summary>已核验 {job.fields.filter(field => ['filled', 'existing'].includes(field.status)).length} 项，待处理 {job.fields.filter(field => !['filled', 'existing'].includes(field.status)).length} 项</summary><ul>{job.fields.map((field, index) => <li key={`${field.field}-${index}`}>{fieldLabel(field.field)} · {field.message}</li>)}</ul></details>}
      </li>)}</ul>
    </div>}
  </div>
}
