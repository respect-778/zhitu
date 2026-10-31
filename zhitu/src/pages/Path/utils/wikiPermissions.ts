import type { AgentPermission, VFile } from '@/types/path'

export const AGENT_PERMISSION_LABEL: Record<AgentPermission, string> = {
  none: '不可访问',
  read: '只读',
  manage: '完全管理',
}

export const AGENT_PERMISSION_DESCRIPTION: Record<AgentPermission, string> = {
  none: '不向 Agent 提供内容',
  read: '可读取和引用，不可修改',
  manage: '按你的指令管理，可恢复',
}

export const getStoredAgentPermission = (file: VFile): AgentPermission => file.agentPermission ?? 'read'

export function getEffectiveAgentPermission(file: VFile, files: VFile[]) {
  let parentId = file.parentId
  while (parentId) {
    const parent = files.find(candidate => candidate.id === parentId)
    if (!parent) break
    if (getStoredAgentPermission(parent) === 'none') {
      return { permission: 'none' as const, blockedBy: parent }
    }
    parentId = parent.parentId
  }
  return { permission: getStoredAgentPermission(file), blockedBy: null }
}

export function collectSubtreeIds(files: VFile[], rootId: string): string[] {
  const result: string[] = []
  const visit = (id: string) => {
    result.push(id)
    files.filter(file => file.parentId === id).forEach(child => visit(child.id))
  }
  visit(rootId)
  return result
}
