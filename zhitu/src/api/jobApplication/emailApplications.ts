import channelConfig from '@/api/jobApplication/applicationChannels.json'
import { autofillProfiles } from '@/utils/jobApplication/autofillProfiles'
import type { AutofillTarget } from '@/types/jobApplication/autofillTypes'

interface EmailChannel {
  id: string
  origin: string
  pathname: string
  recipient: string
  company: string
  language: string
  evidence: string
}
const channels: {
  channels: EmailChannel[]
  providers: { id: string; label: string; domains: string[] }[]
} = channelConfig
export const emailProviders = channels.providers
export interface EmailApplication {
  operationId: string
  job: AutofillTarget
  channel: EmailChannel
  ownerId: string
  resumeId: string
  revision: string
  resumeTitle: string
  subject: string
  body: string
}
export interface EmailReceipt {
  operationId: string
  state: 'sent' | 'failed' | 'pending' | 'unknown'
  message: string
}

export function emailChannel(jobUrl: string): EmailChannel | undefined {
  try {
    const url = new URL(jobUrl)
    if (url.username || url.password || url.port) return undefined
    return channels.channels.find(channel => channel.origin === url.origin && channel.pathname === url.pathname)
  } catch { return undefined }
}

export async function prepareEmailApplications(operationId: string, jobs: AutofillTarget[], resumeId?: string): Promise<EmailApplication[]> {
  const provider = autofillProfiles()
  const choices = provider.choices()
  const selected = resumeId || choices.activeId || (choices.resumes.length === 1 ? choices.resumes[0].id : '')
  if (!selected) throw new Error('请先选择用于邮件投递的简历。')
  const snapshot = provider.read(selected)
  const name = snapshot.profile.name
  if (!name) throw new Error('请先在所选简历中填写姓名。')
  return Promise.all(jobs.map(async job => {
    const channel = emailChannel(job.jobUrl)
    if (!channel) throw new Error('该岗位的招聘邮箱尚待核对。')
    const contact = [name, snapshot.profile.phone, snapshot.profile.email].filter(Boolean).join('\n')
    // UUIDv8 keeps a batch/job pair stable across preparation retries.
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([operationId, job.jobId])))).slice(0, 16)
    digest[6] = (digest[6] & 15) | 128
    digest[8] = (digest[8] & 63) | 128
    const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
    const emailOperationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    return {
      operationId: emailOperationId, job, channel,
      ownerId: snapshot.ownerId, resumeId: selected, revision: snapshot.revision,
      resumeTitle: choices.resumes.find(resume => resume.id === selected)?.title || '所选简历',
      subject: channel.language === 'en' ? `Application for ${job.title} - ${name}` : `应聘${job.title}-${name}`,
      body: channel.language === 'en'
        ? `Dear Recruitment Team,\n\nI would like to apply for the ${job.title} position. Please find my resume attached.\n\nThank you for your consideration.\n\n${contact}`
        : `招聘负责人您好：\n\n我希望应聘贵公司的${job.title}岗位，简历见附件，期待进一步沟通。\n\n感谢您的审阅。\n\n${contact}`,
    }
  }))
}

export function assertEmailResumeCurrent(application: EmailApplication) {
  const current = autofillProfiles().read(application.resumeId)
  if (current.ownerId !== application.ownerId || current.revision !== application.revision)
    throw new Error('简历或账号已变更，请重新生成邮件。')
}

async function mailApi(path: string, payload?: unknown): Promise<EmailReceipt> {
  let service: { token?: string }
  try {
    const status = await fetch('/api/applications/v1/status', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) })
    if (!status.ok) throw new Error('unavailable')
    service = await status.json() as { token?: string }
  } catch { throw new Error('邮件投递服务未连接，请启动 applications:api 后重试。') }
  if (!service.token) throw new Error('邮件投递服务暂不可用。')
  const unknownReceipt = (): EmailReceipt => ({ operationId: (payload as { operationId: string }).operationId,
    state: 'unknown', message: '发送结果待确认，请查询发送状态并核对发件邮箱。' })
  let response: Response
  let result: EmailReceipt & { error?: string }
  try {
    response = await fetch(`/api/applications/v1/email/${path}`, {
      method: payload ? 'POST' : 'GET', credentials: 'same-origin', signal: AbortSignal.timeout(50000),
      headers: { 'Content-Type': 'application/json', 'X-Knowvia-Mail-Token': service.token },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    })
    if (payload && response.status >= 500) return unknownReceipt()
    result = await response.json() as EmailReceipt & { error?: string }
  } catch {
    if (payload) return unknownReceipt()
    throw new Error('发送状态暂不可用，请稍后查询。')
  }
  if (!response.ok) throw new Error(result.error || '邮件服务请求失败，请检查发送状态后重试。')
  if (!['sent', 'failed', 'pending', 'unknown'].includes(result.state)) {
    if (payload) return unknownReceipt()
    throw new Error('邮件回执格式无效，请查询发送结果。')
  }
  return result
}

export async function sendEmailApplication(application: EmailApplication, provider: string, account: string, authorizationCode: string, attachment: File) {
  assertEmailResumeCurrent(application)
  if (!attachment.size || attachment.size > 10 * 1024 * 1024 || !/\.(pdf|docx?)$/i.test(attachment.name))
    throw new Error('请选择10MB以内的当前简历 PDF 或 Word 附件。')
  const bytes = new Uint8Array(await attachment.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768))
  assertEmailResumeCurrent(application)
  return mailApi('send', { operationId: application.operationId, job: application.job,
    provider, account: account.trim(), authorizationCode, subject: application.subject, body: application.body,
    attachment: { filename: attachment.name, base64: btoa(binary) } })
}
export const getEmailReceipt = (operationId: string) => mailApi(`status/${encodeURIComponent(operationId)}`)
