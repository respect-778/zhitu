import { bridge } from '@/api/jobApplication/bridge'
import { autofillProfiles } from '@/utils/jobApplication/autofillProfiles'
import type { AutofillTarget, AutofillTaskStatus } from '@/types/jobApplication/autofillTypes'

interface ActiveTask {
  taskId: string
  ownerId: string
  resumeId: string
  revision: string
}
const KEY = 'knowvia-official-autofill-task'
let subscribed = false
function activeTask(): ActiveTask | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') as ActiveTask | null }
  catch { return null }
}
function isCurrent(task: ActiveTask) {
  try {
    const current = autofillProfiles().read(task.resumeId)
    return current.ownerId === task.ownerId && current.revision === task.revision
  } catch { return false }
}
export async function cancelAutofill(taskId: string) {
  const result = await bridge<AutofillTaskStatus>('AUTOFILL_CANCEL', { taskId })
  if (activeTask()?.taskId === taskId) sessionStorage.removeItem(KEY)
  return result
}
function watchProfile() {
  if (subscribed) return
  subscribed = true
  autofillProfiles().subscribe(() => {
    const task = activeTask()
    if (task && !isCurrent(task)) void cancelAutofill(task.taskId).catch(() => {})
  })
}
export function currentAutofillTaskId() { return activeTask()?.taskId || null }
export async function getAutofillStatus(taskId: string) {
  const task = activeTask()
  if (!task || task.taskId !== taskId || !isCurrent(task)) {
    await cancelAutofill(taskId).catch(() => {})
    throw new Error('简历或账号已变更，填写已停止，请重新发起。')
  }
  watchProfile()
  const result = await bridge<AutofillTaskStatus>('AUTOFILL_STATUS', { taskId })
  // Keep the value-free receipt identifier available after refresh until another task replaces it.
  return result
}
export async function startOfficialAutofill(operationId: string, jobs: AutofillTarget[], resumeId?: string) {
  const source = autofillProfiles()
  const choices = source.choices()
  const selected = resumeId || choices.activeId || (choices.resumes.length === 1 ? choices.resumes[0].id : '')
  if (!selected) throw new Error(choices.resumes.length ? '请先选择用于填写的简历。' : '请先在简历模块保存并确认一份简历。')
  const profile = source.read(selected)
  const capabilities = await bridge<{ official_autofill?: boolean; official_autofill_systems?: string[] }>('PING')
  if (!capabilities.official_autofill) throw new Error('请在扩展管理页重新加载最新版 Knowvia 浏览器助手，然后重试。')
  const requiresMultiSystem = jobs.some(job => {
    try { return /\.(?:jobs\.feishu\.cn|zhiye\.com)$/.test(new URL(job.jobUrl).hostname) }
    catch { return false }
  })
  if (requiresMultiSystem && !['feishu', 'beisen'].every(system => capabilities.official_autofill_systems?.includes(system)))
    throw new Error('请在扩展管理页重新加载支持飞书招聘和北森的最新版 Knowvia 浏览器助手，然后重试。')
  const latest = source.read(selected)
  if (latest.ownerId !== profile.ownerId || latest.revision !== profile.revision)
    throw new Error('简历或账号已变更，请重新发起填写。')
  const task = { taskId: operationId, ownerId: profile.ownerId, resumeId: selected, revision: profile.revision }
  sessionStorage.setItem(KEY, JSON.stringify(task))
  watchProfile()
  try {
    const result = await bridge<AutofillTaskStatus>('AUTOFILL_START', {
      operationId, ownerId: profile.ownerId, resumeId: selected, revision: profile.revision, profile: profile.profile, jobs,
    })
    if (!isCurrent(task)) {
      await cancelAutofill(result.taskId)
      throw new Error('简历资料已变更，请重新发起填写。')
    }
    return result
  } catch (error) {
    await cancelAutofill(operationId).catch(() => {})
    if (activeTask()?.taskId === operationId) sessionStorage.removeItem(KEY)
    throw error
  }
}
