import { createSlice, createAsyncThunk, createListenerMiddleware, isAnyOf, type PayloadAction } from '@reduxjs/toolkit'
import type { VFile, GrowthPlan, SidebarPanel, AgentPermission, WikiLinkBinding } from '@/types/path'
import { getWorkspaceAPI, saveWorkspaceAPI, type WorkspaceData } from '@/api/path'
import { getStore } from '@/utils/store'
import { WorkspaceSaveQueue, type SaveState, type SaveSnapshot, type WorkspaceSyncStatus } from '@/utils/workspaceSaveQueue'
import { buildWikiLinkBindings, reconcileFileWikiLinkBindings } from '@/pages/Path/utils/wikiLinks'

interface PathState {
  files: VFile[]
  openTabs: string[]
  activeTabId: string | null
  sidebarPanel: SidebarPanel
  sidebarVisible: boolean
  expandedFolderIds: string[]
  activePlan: GrowthPlan | null
  mentorId: string | null
  storageUserId: string
  revision: number | null
  syncStatus: WorkspaceSyncStatus
  syncError: string
  wikiTemplateVersion: number | null
  wikiInitializedAt: string | null
  linkBindings: WikiLinkBinding[]
}

const STORAGE_KEY_PREFIX = 'zhitu_path'
const getStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}_${userId}`

const loadFromStorage = (userId: string): Partial<PathState> => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const now = () => new Date().toISOString()

const bootstrapMeta = () => ({ createdAt: now(), updatedAt: now(), tags: [] })

const bootstrapFolder = (id: string, name: string, parentId: string | null, order: number): VFile => ({
  id, name, type: 'folder', parentId, order,
  createdByKind: 'bootstrap', agentPermission: 'manage', metadata: bootstrapMeta(),
})

const bootstrapNote = (id: string, name: string, parentId: string, order: number, content: string): VFile => ({
  id, name, type: 'file', parentId, order, content, fileType: 'note',
  createdByKind: 'bootstrap', agentPermission: 'manage', metadata: bootstrapMeta(),
})

// 新工作区初始 Wiki：四个目录、五个文件。已有工作区不会通过此常量补建。
const DEFAULT_FILES: VFile[] = [
  bootstrapFolder('wiki-sources', '资料库', null, 0),
  bootstrapFolder('wiki-knowledge', '知识库', null, 1),
  bootstrapFolder('wiki-learning-record', '学习档案', null, 2),
  bootstrapNote('wiki-learning-overview', '学习概况', 'wiki-learning-record', 0, '# 学习概况\n\n- 目标：尚未设置\n- 已有学习记录：暂无\n\n> 用户自述、实际学习证据与 Agent 建议会分别标注。'),
  bootstrapFolder('wiki-management', 'Wiki管理', null, 3),
  bootstrapNote('wiki-index', 'index', 'wiki-management', 0, '# Wiki 导航\n\n- **资料库/**：保存来源条目与说明\n- **知识库/**：沉淀可追溯的主题知识\n- **学习档案/**：记录目标、进展与复盘\n- **Wiki管理/**：保存整理约定、技能目录与维护记录\n\n在正文输入 `[[笔记名]]` 可建立可追踪的知识关联。'),
  bootstrapNote('wiki-schema', 'schema', 'wiki-management', 1, '# 整理约定\n\n1. 先查找并更新已有页面，确有独立用途时再新建。\n2. 关键结论必须保留出处；有分歧时同时记录。\n3. 权限决定 Agent 能做什么，用户指令决定本次做什么。\n4. 不因保存、收藏或进入页面自动启动模型整理。'),
  bootstrapNote('wiki-skill', 'skill', 'wiki-management', 2, '# Agent 技能目录\n\n暂无可用技能。\n\n技能条目将记录：skillId、名称、用途、说明入口、版本、所需工具与状态。文档中的名称不会自动安装技能或扩大权限。'),
  bootstrapNote('wiki-log', 'log', 'wiki-management', 3, `# Wiki 维护记录\n\n- ${now()}：初始化 Wiki 结构（模板 v1）。`),
]

const initialState: PathState = {
  files: DEFAULT_FILES,
  openTabs: [],
  activeTabId: null,
  sidebarPanel: 'files',
  sidebarVisible: true,
  expandedFolderIds: ['wiki-knowledge', 'wiki-learning-record', 'wiki-management'],
  activePlan: null,
  mentorId: null,
  storageUserId: '',
  revision: null,
  syncStatus: 'loading',
  syncError: '',
  wikiTemplateVersion: 1,
  wikiInitializedAt: now(),
  linkBindings: buildWikiLinkBindings(DEFAULT_FILES),
}

// debounce 同步到后端：即时写 localStorage，延迟 1.5s 发 PUT 请求
// 高频操作（如编辑器输入）不会每次都打后端，只会在停顿后同步一次

const clientId = sessionStorage.getItem('zhitu_path_client') || crypto.randomUUID()
sessionStorage.setItem('zhitu_path_client', clientId)
const getDraftKey = (userId: string) => `zhitu_path_draft_${userId}_${clientId}`
type Draft = { data: WorkspaceData; revision: number | null }
let onSyncState: ((userId: string, state: SaveState<WorkspaceData>) => void) | undefined

const readDraft = (userId: string): Draft | undefined => {
  try {
    const raw = localStorage.getItem(getDraftKey(userId))
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

export const workspaceSaveQueue = new WorkspaceSaveQueue<WorkspaceData>(
  async (userId, data, revision, keepalive) => {
    if (String(getStore('userId') || '') !== userId) throw new Error('当前账号已切换')
    return saveWorkspaceAPI(data, revision, keepalive)
  },
  (userId, state) => {
    if (state.pending) {
      localStorage.setItem(getDraftKey(userId), JSON.stringify({ data: state.pending, revision: state.revision }))
    } else {
      localStorage.removeItem(getDraftKey(userId))
    }
    if (state.savedData) localStorage.setItem(getStorageKey(userId), JSON.stringify(state.savedData))
    onSyncState?.(userId, state)
  },
)

export const bindPathSync = (callback: NonNullable<typeof onSyncState>) => { onSyncState = callback }

const toWorkspaceData = (state: PathState): WorkspaceData => JSON.parse(JSON.stringify({
    files: state.files,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    expandedFolderIds: state.expandedFolderIds,
    activePlan: state.activePlan,
    mentorId: state.mentorId,
    wikiTemplateVersion: state.wikiTemplateVersion,
    wikiInitializedAt: state.wikiInitializedAt,
    linkBindings: state.linkBindings,
  }))

// 立即触发文件和文件内容的同步
export const flushSync = (keepalive = false) => workspaceSaveQueue.flush(String(getStore('userId') || ''), keepalive)

/**
 * 加载用户工作区（async thunk）
 * 优先从后端拉取，失败时 fallback 到 localStorage，都没有则使用 DEFAULT_FILES
 */
export const loadPathWorkspace = createAsyncThunk(
  'path/loadWorkspace',
  async (userId: string) => {
    const uid = userId.trim()
    if (!uid) return { userId: uid, snapshot: { data: null, revision: 0 } as SaveSnapshot<WorkspaceData>, offline: false, draft: undefined as Draft | undefined }
    try {
      const res = await getWorkspaceAPI()
      if (!Number.isSafeInteger(res.revision)) throw new Error('后端尚未支持工作区版本，请重启更新后的后端')
      return { userId: uid, snapshot: res, offline: false, draft: readDraft(uid) }
    } catch {
      const saved = loadFromStorage(uid)
      return { userId: uid, snapshot: { data: saved.files ? saved as WorkspaceData : null, revision: 0 }, offline: true, draft: readDraft(uid) }
    }
  }
)

export const recoverPathWorkspace = createAsyncThunk('path/recoverWorkspace', async (userId: string) => {
  await workspaceSaveQueue.flush(userId)
  const snapshot = await getWorkspaceAPI()
  const draft = workspaceSaveQueue.peek(userId)?.pending || readDraft(userId)?.data
  if (!Number.isSafeInteger(snapshot.revision)) throw new Error('后端尚未支持工作区版本')
  const data: WorkspaceData = snapshot.data ? structuredClone(snapshot.data) : {
    files: structuredClone(DEFAULT_FILES), openTabs: [], activeTabId: null, expandedFolderIds: ['wiki-knowledge'], activePlan: null, mentorId: null,
    wikiTemplateVersion: 1, wikiInitializedAt: now(),
    linkBindings: buildWikiLinkBindings(DEFAULT_FILES),
  }
  if (draft) {
    localStorage.setItem(`zhitu_path_recovery_${userId}_${Date.now()}`, JSON.stringify(draft))
    const files = data.files as VFile[]
    for (const file of draft.files as VFile[]) {
      if (file.type !== 'file') continue
      const existing = files.find(candidate => candidate.id === file.id)
      if (existing && existing.content === file.content && existing.name === file.name) continue
      const id = crypto.randomUUID()
      files.push({
        id, name: `${file.name}（本地副本）`, type: 'file', content: file.content, fileType: 'note',
        parentId: files.some(candidate => candidate.id === file.parentId && candidate.type === 'folder') ? file.parentId : null,
        order: files.length, metadata: { createdAt: now(), updatedAt: now(), tags: file.metadata?.tags || [] },
        createdByKind: 'user', agentPermission: 'read',
      })
      if (draft.activeTabId === file.id) { data.activeTabId = id; data.openTabs.push(id) }
    }
  }
  data.linkBindings = buildWikiLinkBindings(data.files as VFile[], data.linkBindings ?? [])
  return { userId, snapshot, data }
})

const applyWorkspace = (state: PathState, data: WorkspaceData) => {
  state.files = (data.files as VFile[]).map(file => ({
    ...file,
    createdByKind: file.createdByKind ?? 'user',
    agentPermission: file.agentPermission ?? 'read',
  }))
  state.openTabs = data.openTabs ?? []
  state.activeTabId = data.activeTabId ?? null
  const folderIds = new Set(state.files.filter(file => file.type === 'folder').map(file => file.id))
  state.expandedFolderIds = (data.expandedFolderIds ?? []).filter(id => folderIds.has(id))
  state.activePlan = data.activePlan as GrowthPlan ?? null
  state.mentorId = data.mentorId ?? null
  state.wikiTemplateVersion = data.wikiTemplateVersion ?? null
  state.wikiInitializedAt = data.wikiInitializedAt ?? null
  state.linkBindings = buildWikiLinkBindings(state.files, data.linkBindings ?? [])
}

const pathSlice = createSlice({
  name: 'path',
  initialState,
  reducers: {
    setSyncState(state, action: PayloadAction<{ userId: string; sync: SaveState<WorkspaceData> }>) {
      if (state.storageUserId !== action.payload.userId) return
      state.revision = action.payload.sync.revision
      state.syncStatus = action.payload.sync.status
      state.syncError = action.payload.sync.message
    },
    // 创建文件/文件夹
    createFile(state, action: PayloadAction<{ id?: string; name: string; type: 'file' | 'folder'; parentId: string | null; content?: string; fileType?: VFile['fileType'] }>) {
      const { id, name, type, parentId, content, fileType } = action.payload
      const siblings = state.files.filter(f => f.parentId === parentId)
      const file: VFile = {
        id: id ?? crypto.randomUUID(),
        name,
        type,
        parentId,
        content: content ?? '',
        fileType: fileType ?? 'note',
        createdByKind: 'user',
        agentPermission: 'read',
        order: siblings.length,
        metadata: { createdAt: now(), updatedAt: now(), tags: [] },
      }
      state.files.push(file)
      state.linkBindings = buildWikiLinkBindings(state.files, state.linkBindings)
      if (type === 'file') {
        state.openTabs.push(file.id)
        state.activeTabId = file.id
      }
      if (parentId) {
        const idx = state.expandedFolderIds.indexOf(parentId)
        if (idx === -1) state.expandedFolderIds.push(parentId)
      }
    },

    // 删除文件/文件夹
    deleteFile(state, action: PayloadAction<string>) {
      const collectIds = (id: string): string[] => {
        const children = state.files.filter(f => f.parentId === id)
        return [id, ...children.flatMap(c => collectIds(c.id))]
      }
      const ids = new Set(collectIds(action.payload))
      state.files = state.files.filter(f => !ids.has(f.id))
      state.linkBindings = buildWikiLinkBindings(state.files, state.linkBindings)
      state.openTabs = state.openTabs.filter(id => !ids.has(id))
      if (state.activeTabId && ids.has(state.activeTabId)) {
        state.activeTabId = state.openTabs[0] ?? null
      }
      state.expandedFolderIds = state.expandedFolderIds.filter(id => !ids.has(id))
    },

    // 重命名文件
    renameFile(state, action: PayloadAction<{ id: string; name: string }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.name = action.payload.name
        if (file.metadata) file.metadata.updatedAt = now()
        state.linkBindings = buildWikiLinkBindings(state.files, state.linkBindings)
      }
    },

    // 更新文件内容
    updateFileContent(state, action: PayloadAction<{ id: string; content: string }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.content = action.payload.content
        if (file.metadata) file.metadata.updatedAt = now()
        state.linkBindings = [
          ...state.linkBindings.filter(binding => binding.sourceFileId !== file.id),
          ...reconcileFileWikiLinkBindings(file, state.files, state.linkBindings),
        ]
      }
    },

    // 打开文件
    openTab(state, action: PayloadAction<string>) {
      if (!state.openTabs.includes(action.payload)) {
        state.openTabs.push(action.payload)
      }
      state.activeTabId = action.payload
    },

    // 关闭文件
    closeTab(state, action: PayloadAction<string>) {
      const idx = state.openTabs.indexOf(action.payload)
      if (idx === -1) return
      state.openTabs.splice(idx, 1)
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.openTabs[Math.min(idx, state.openTabs.length - 1)] ?? null
      }
    },

    closeAllTabs(state) {
      state.openTabs = []
      state.activeTabId = null
    },

    // 激活文件
    setActiveTab(state, action: PayloadAction<string>) {
      state.activeTabId = action.payload
    },

    // 切换文件夹
    toggleFolder(state, action: PayloadAction<string>) {
      const idx = state.expandedFolderIds.indexOf(action.payload)
      if (idx === -1) state.expandedFolderIds.push(action.payload)
      else state.expandedFolderIds.splice(idx, 1)
    },

    // 折叠所有文件
    collapseAllFolders(state) {
      state.expandedFolderIds = []
    },

    expandAllFolders(state) {
      state.expandedFolderIds = state.files.filter(file => file.type === 'folder').map(file => file.id)
    },

    // 切换侧边栏
    setSidebarPanel(state, action: PayloadAction<SidebarPanel>) {
      state.sidebarPanel = action.payload
      if (!state.sidebarVisible) state.sidebarVisible = true
    },

    // 切换侧边栏
    toggleSidebar(state) {
      state.sidebarVisible = !state.sidebarVisible
    },

    setSidebarVisible(state, action: PayloadAction<boolean>) {
      state.sidebarVisible = action.payload
    },

    setAgentPermission(state, action: PayloadAction<{ ids: string[]; permission: AgentPermission }>) {
      const ids = new Set(action.payload.ids)
      const timestamp = now()
      for (const file of state.files) {
        if (!ids.has(file.id)) continue
        file.agentPermission = action.payload.permission
        if (file.metadata) file.metadata.updatedAt = timestamp
      }
    },

    // 移动文件
    moveFile(state, action: PayloadAction<{ id: string; newParentId: string | null }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.parentId = action.payload.newParentId
        if (file.metadata) file.metadata.updatedAt = now()
        state.linkBindings = buildWikiLinkBindings(state.files, state.linkBindings)
      }
    },

    // 批量移动必须作为一次工作区变更保存，避免多选拖拽产生中间结构。
    batchMoveFiles(state, action: PayloadAction<{ ids: string[]; newParentId: string | null }>) {
      const ids = new Set(action.payload.ids)
      const timestamp = now()
      for (const file of state.files) {
        if (!ids.has(file.id) || file.parentId === action.payload.newParentId) continue
        file.parentId = action.payload.newParentId
        if (file.metadata) file.metadata.updatedAt = timestamp
      }
      state.linkBindings = buildWikiLinkBindings(state.files, state.linkBindings)
    },

    // 批量删除
    batchDeleteFiles(state, action: PayloadAction<string[]>) {
      const allIds = new Set<string>()
      const collectIds = (id: string) => {
        allIds.add(id)
        state.files.filter(f => f.parentId === id).forEach(c => collectIds(c.id))
      }
      action.payload.forEach(id => collectIds(id))
      state.files = state.files.filter(f => !allIds.has(f.id))
      state.linkBindings = buildWikiLinkBindings(state.files, state.linkBindings)
      state.openTabs = state.openTabs.filter(id => !allIds.has(id))
      if (state.activeTabId && allIds.has(state.activeTabId)) {
        state.activeTabId = state.openTabs[0] ?? null
      }
      state.expandedFolderIds = state.expandedFolderIds.filter(id => !allIds.has(id))
    },

    // 批量创建（用于粘贴）
    batchCreateFiles(state, action: PayloadAction<Array<{
      id: string; name: string; type: 'file' | 'folder';
      parentId: string | null; content?: string; fileType?: VFile['fileType']; order: number;
    }>>) {
      const ts = now()
      for (const item of action.payload) {
        state.files.push({
          ...item,
          content: item.content ?? '',
          fileType: item.fileType ?? 'note',
          createdByKind: 'user',
          agentPermission: 'read',
          metadata: { createdAt: ts, updatedAt: ts, tags: [] },
        })
      }
      state.linkBindings = buildWikiLinkBindings(state.files, state.linkBindings)
    },

    // 排序
    sortFiles(state, action: PayloadAction<'name' | 'created' | 'updated'>) {
      const by = action.payload
      const comparator = (a: VFile, b: VFile): number => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        if (by === 'name') return a.name.localeCompare(b.name, 'zh-CN')
        const aTime = a.metadata?.[by === 'created' ? 'createdAt' : 'updatedAt'] ?? ''
        const bTime = b.metadata?.[by === 'created' ? 'createdAt' : 'updatedAt'] ?? ''
        return bTime.localeCompare(aTime)
      }

      const groups = new Map<string | null, VFile[]>()
      for (const f of state.files) {
        const list = groups.get(f.parentId) ?? []
        list.push(f)
        groups.set(f.parentId, list)
      }
      for (const [, list] of groups) {
        list.sort(comparator)
        list.forEach((f, i) => { f.order = i })
      }
    },
  },

  // 异步处理
  extraReducers: (builder) => {
    builder.addCase(loadPathWorkspace.pending, (state, action) => {
      if (state.storageUserId !== action.meta.arg) {
        Object.assign(state, structuredClone(initialState), { storageUserId: action.meta.arg })
      }
    })
    builder.addCase(loadPathWorkspace.fulfilled, (state, action) => {
      const { userId, snapshot, draft, offline } = action.payload
      if (!userId || state.storageUserId !== userId) return
      const queued = workspaceSaveQueue.peek(userId)
      const data = queued?.pending || draft?.data ||
        (queued?.revision !== null && queued?.revision !== undefined && queued.revision > snapshot.revision ? queued.savedData : snapshot.data)
      if (data) applyWorkspace(state, data)
      else {
        const saved = loadFromStorage(userId)
        if (saved.files) applyWorkspace(state, saved as WorkspaceData)
      }
      state.revision = queued?.revision ?? (offline ? null : snapshot.revision)
      state.syncStatus = offline ? 'error' : 'saved'
      state.syncError = offline ? '无法读取服务器数据，本地修改已保留，请重试加载' : ''
    })
    builder.addCase(recoverPathWorkspace.fulfilled, (state, action) => {
      if (state.storageUserId !== action.payload.userId) return
      applyWorkspace(state, action.payload.data)
      state.revision = action.payload.snapshot.revision
    })
    builder.addCase(recoverPathWorkspace.rejected, (state) => {
      state.syncError = '更新失败，本地修改仍保留，请稍后重试'
    })
  },
})

export const {
  createFile, deleteFile, renameFile, updateFileContent, moveFile, batchMoveFiles,
  batchDeleteFiles, batchCreateFiles, sortFiles,
  openTab, closeTab, closeAllTabs, setActiveTab,
  toggleFolder, collapseAllFolders, expandAllFolders,
  setSidebarPanel, setSidebarVisible, toggleSidebar,
  setAgentPermission,
  setSyncState,
} = pathSlice.actions

export const pathSyncListener = createListenerMiddleware()
pathSyncListener.startListening({
  matcher: isAnyOf(createFile, deleteFile, renameFile, updateFileContent, moveFile, batchMoveFiles, batchDeleteFiles, batchCreateFiles, sortFiles, openTab, closeTab, closeAllTabs, setActiveTab, toggleFolder, collapseAllFolders, expandAllFolders, setAgentPermission),
  effect: (_action, api) => {
    const state = (api.getState() as { path: PathState }).path
    if (state.storageUserId) workspaceSaveQueue.enqueue(state.storageUserId, toWorkspaceData(state), state.revision)
  },
})
pathSyncListener.startListening({
  actionCreator: loadPathWorkspace.fulfilled,
  effect: (action, api) => {
    const { userId, snapshot, offline, draft } = action.payload
    const state = (api.getState() as { path: PathState }).path
    if (!userId || state.storageUserId !== userId) return
    if (offline) return
    workspaceSaveQueue.initialize(userId, snapshot, draft)
    if (!snapshot.data && !draft && !workspaceSaveQueue.peek(userId)?.pending) {
      workspaceSaveQueue.enqueue(userId, toWorkspaceData(state), snapshot.revision)
    }
  },
})
pathSyncListener.startListening({
  actionCreator: recoverPathWorkspace.fulfilled,
  effect: (action, api) => {
    const state = (api.getState() as { path: PathState }).path
    if (state.storageUserId !== action.payload.userId) return
    workspaceSaveQueue.replaceBaseline(action.payload.userId, action.payload.snapshot)
    workspaceSaveQueue.enqueue(action.payload.userId, action.payload.data, action.payload.snapshot.revision)
  },
})

export default pathSlice.reducer
