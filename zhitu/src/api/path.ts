import httpInstance from '@/utils/http'
import type { SaveSnapshot } from '@/utils/workspaceSaveQueue'
import type { WikiLinkBinding } from '@/types/path'

/** 后端存储的工作区数据结构 */
export interface WorkspaceData {
  files: unknown[]                // 虚拟文件系统（VFile 扁平数组）
  openTabs: string[]              // 已打开的标签页 id 列表
  activeTabId: string | null      // 当前激活的标签页 id
  expandedFolderIds: string[]     // 已展开的文件夹 id 列表
  activePlan: unknown | null      // 成长计划（预留）
  mentorId: string | null         // 当前导师 id
  wikiTemplateVersion?: number | null
  wikiInitializedAt?: string | null
  linkBindings?: WikiLinkBinding[]
}

/** 获取用户工作区数据，新用户返回 { data: null } */
export const getWorkspaceAPI = (): Promise<SaveSnapshot<WorkspaceData>> => {
  return httpInstance({ url: '/growth/workspace', method: 'get' })
}

/** 保存工作区数据到后端（前端 debounce 1.5s 后调用） */
export const saveWorkspaceAPI = (data: WorkspaceData, revision: number, keepalive = false): Promise<SaveSnapshot<WorkspaceData>> => {
  return httpInstance({
    url: '/growth/workspace', method: 'put', data: { data, revision },
    ...(keepalive ? { adapter: 'fetch', fetchOptions: { keepalive: true } } : {}),
  })
}
