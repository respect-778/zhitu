import type { DirectoryStatus } from './personalDirectory'
import type { BackupKind } from './personalDirectoryPlan'
import type { WorkspaceSyncStatus } from './workspaceSaveQueue'

/** 成功只针对当前模块、当前云端版本和已落盘的同一快照。 */
export function personalSaveNotice(directory: DirectoryStatus, kind: BackupKind, cloudStatus: WorkspaceSyncStatus, revision: number | null) {
  const notice = (text: string, tone: 'success' | 'warning' | 'muted') => ({ text, tone })
  if (cloudStatus === 'error') return notice('同步失败，修改已保留', 'warning')
  if (cloudStatus === 'conflict') return notice('版本冲突，修改已保留', 'warning')
  if (cloudStatus === 'loading') return notice('正在加载', 'muted')
  if (!directory.supported) return notice('当前浏览器不支持本地自动保存', 'muted')
  if (!directory.name) return notice('未配置本地文件夹', 'muted')
  if (directory.phase === 'permission') return notice('本地文件夹需要重新授权', 'warning')
  if (directory.phase === 'error') return notice('本地文件夹保存失败', 'warning')
  const module = directory.modules[kind]
  if (cloudStatus !== 'saved' || !module?.saved || !module.confirmed || revision === null || module.revision !== revision
    || directory.phase === 'checking' || directory.phase === 'unconfigured') return notice('正在保存…', 'muted')
  if (module.conflict) return notice('原文件已保留，已另存副本', 'warning')
  return notice('已保存到本地文件夹', 'success')
}
