import { catalogJobId } from '@/api/jobApplication/catalogClient'
import type { SearchResultRow } from '@/utils/jobApplication/catalogViewModel'
import { platformJobLink, platformJobId, type JobPlatform } from '@/utils/jobApplication/platforms'
import type { Job } from '@/utils/jobApplication/model'
import { startOfficialAutofill } from '@/api/jobApplication/autofillClient'
import { assertEmailResumeCurrent, emailChannel, prepareEmailApplications, type EmailApplication } from '@/api/jobApplication/emailApplications'

export interface PlatformJobTarget {
  platform: JobPlatform
  jobId: string
  title: string
  company: string
  jobUrl: string
}
export type ApplicationJobTarget =
  | { source: 'catalog'; jobId: string; title: string; company: string; jobUrl?: string }
  | ({ source: 'platform' } & PlatformJobTarget)

export type JobActionSelection =
  | { type: 'platform_jobs'; jobs: PlatformJobTarget[] }
  | { type: 'selected_jobs'; jobs: ApplicationJobTarget[] }
export interface JobActionRequest {
  version: 1
  operationId: string
  action: 'greet' | 'apply'
  selection: JobActionSelection
  greetingTemplateId?: string
  resumeVersionId?: string
}
export type JobActionResponse =
  | { operationId: string; status: 'accepted'; taskId: string; emails?: EmailApplication[] }
  | { operationId: string; status: 'email_ready'; emails: EmailApplication[]; message?: string }
  | { operationId: string; status: 'blocked'; code: 'INVALID_REQUEST' | 'GREETING_TEMPLATE_REQUIRED' | 'APPLICATION_ADAPTER_UNAVAILABLE'; message: string }

export function platformJobTargets(jobs: Job[]): PlatformJobTarget[] {
  return jobs.map(job => ({
    platform: job.platform || 'boss',
    jobId: platformJobId(job.url, job.platform || 'boss'),
    title: job.title,
    company: job.company,
    jobUrl: job.url,
  }))
}

export function selectedApplicationTargets(rows: SearchResultRow[]): ApplicationJobTarget[] {
  return rows.map(row => {
    const jobId = row.key.slice('catalog:'.length)
    if (row.key.startsWith('catalog:') && catalogJobId.test(jobId)) {
      return { source: 'catalog', jobId, title: row.title, company: row.company, jobUrl: row.href }
    }
    const platform = row.key.startsWith('liepin:') ? 'liepin' : row.key.startsWith('zhaopin:') ? 'zhaopin' : 'boss'
    const jobUrl = platformJobLink(row.href || '', platform)
    if (!jobUrl || row.key !== `${platform}:${new URL(jobUrl).pathname}`) throw new Error('Invalid selected job')
    return {
      source: 'platform',
      platform,
      jobId: platformJobId(jobUrl, platform),
      title: row.title,
      company: row.company,
      jobUrl,
    }
  })
}
export async function requestJobAction(input: JobActionRequest): Promise<JobActionResponse> {
  if (input.version !== 1 || !input.operationId || !['greet', 'apply'].includes(input.action)
    || (input.action === 'greet' && input.selection.type !== 'platform_jobs')
    || (input.action === 'apply' && input.selection.type !== 'selected_jobs')
    || input.selection.jobs.length === 0
    || (input.action === 'apply' && (input.selection.jobs.length > 50
      || new Set(input.selection.jobs.map(job => job.jobId)).size !== input.selection.jobs.length))) {
    return { operationId: input.operationId, status: 'blocked', code: 'INVALID_REQUEST', message: '请重新选择岗位后重试。' }
  }
  if (input.action === 'greet') return { operationId: input.operationId, status: 'blocked', code: 'GREETING_TEMPLATE_REQUIRED', message: '打招呼模板正在准备中，配置完成后即可使用。' }
  try {
    const targets = input.selection.jobs.map(job => ({
      jobId: job.jobId, title: job.title, company: job.company, jobUrl: job.jobUrl || '',
    }))
    const emailTargets = targets.filter(job => emailChannel(job.jobUrl))
    const emails = emailTargets.length ? await prepareEmailApplications(input.operationId, emailTargets, input.resumeVersionId) : []
    emails.forEach(assertEmailResumeCurrent)
    const forms = targets.filter(job => !emailChannel(job.jobUrl))
    if (!forms.length) return { operationId: input.operationId, status: 'email_ready', emails }
    let task
    try { task = await startOfficialAutofill(input.operationId, forms, input.resumeVersionId) }
    catch (error) {
      if (!emails.length) throw error
      emails.forEach(assertEmailResumeCurrent)
      return { operationId: input.operationId, status: 'email_ready', emails,
        message: `邮箱邮件已准备。官网填写启动失败，${error instanceof Error ? error.message : '请检查浏览器助手。'}` }
    }
    emails.forEach(assertEmailResumeCurrent)
    return { operationId: input.operationId, status: 'accepted', taskId: task.taskId, ...(emails.length ? { emails } : {}) }
  } catch (error) {
    return { operationId: input.operationId, status: 'blocked', code: 'APPLICATION_ADAPTER_UNAVAILABLE',
      message: error instanceof Error ? error.message : '官网填写任务未能启动，请重试。' }
  }
}
