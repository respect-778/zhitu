import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit'
import type { VFile, GrowthPlan, SidebarPanel } from '@/types/path'
import { getWorkspaceAPI, saveWorkspaceAPI, type WorkspaceData } from '@/api/path'
import { getStore } from '@/utils/store'

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

// 初始文件
const DEFAULT_FILES: VFile[] = [
  { id: 'folder-plan', name: '我的规划', type: 'folder', parentId: null, order: 0 },
  { id: 'folder-notes', name: '学习笔记', type: 'folder', parentId: null, order: 1 },
  { id: 'folder-cite', name: '引用收藏', type: 'folder', parentId: null, order: 2 },
  { id: 'folder-summary', name: '周总结', type: 'folder', parentId: null, order: 3 },
  { id: 'folder-archive', name: '成长档案', type: 'folder', parentId: null, order: 4 },
]

const initialState: PathState = {
  files: DEFAULT_FILES,
  openTabs: [],
  activeTabId: null,
  sidebarPanel: 'files',
  sidebarVisible: true,
  expandedFolderIds: ['folder-plan', 'folder-notes'],
  activePlan: null,
  mentorId: null,
  storageUserId: '',
}

// debounce 同步到后端：即时写 localStorage，延迟 1.5s 发 PUT 请求
// 高频操作（如编辑器输入）不会每次都打后端，只会在停顿后同步一次

let pendingJson: string | null = null // 用于记住待发送的请求

let syncTimer: ReturnType<typeof setTimeout> | null = null

const syncToBackend = (state: PathState) => {
  if (!state.storageUserId) return
  const data: WorkspaceData = {
    files: state.files,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    expandedFolderIds: state.expandedFolderIds,
    activePlan: state.activePlan,
    mentorId: state.mentorId,
  }
  // Immer draft proxy 在 reducer 结束后会被 revoked，
  // 必须在此时序列化，setTimeout 回调中才能安全使用
  const json = JSON.stringify(data)
  localStorage.setItem(getStorageKey(state.storageUserId), json)

  pendingJson = json // 记录需要发送的请求

  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    saveWorkspaceAPI(JSON.parse(json))
      .then(() => { pendingJson = null }) // 发送成功清空
      .catch((err) => {
        console.error('[PathStore] 同步到后端失败:', err?.response?.status, err?.message)
      })
  }, 1500)
}

// 立即触发文件和文件内容的同步
export const flushSync = () => {
  // 没有待发送请求时，直接返回
  if (pendingJson === null) return

  // 取消 debounce 定时器，这里立即发送请求
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }

  const token = getStore('token')
  const baseURL = import.meta.env.VITE_BASE_URL

  fetch(`${baseURL}/growth/workspace`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ data: JSON.parse(pendingJson) }),
    keepalive: true,
  }).catch(() => { })

  pendingJson = null
}

/**
 * 加载用户工作区（async thunk）
 * 优先从后端拉取，失败时 fallback 到 localStorage，都没有则使用 DEFAULT_FILES
 */
export const loadPathWorkspace = createAsyncThunk(
  'path/loadWorkspace',
  async (userId: string) => {
    const uid = userId.trim()
    if (!uid) return { userId: uid, data: null as WorkspaceData | null }
    try {
      const res = await getWorkspaceAPI()
      return { userId: uid, data: res.data }
    } catch {
      return { userId: uid, data: null }
    }
  }
)

const pathSlice = createSlice({
  name: 'path',
  initialState,
  reducers: {
    // 创建文件/文件夹
    createFile(state, action: PayloadAction<{ name: string; type: 'file' | 'folder'; parentId: string | null; content?: string; fileType?: VFile['fileType'] }>) {
      const { name, type, parentId, content, fileType } = action.payload
      const siblings = state.files.filter(f => f.parentId === parentId)
      const file: VFile = {
        id: crypto.randomUUID(),
        name,
        type,
        parentId,
        content: content ?? '',
        fileType: fileType ?? 'note',
        order: siblings.length,
        metadata: { createdAt: now(), updatedAt: now(), tags: [] },
      }
      state.files.push(file)
      if (type === 'file') {
        state.openTabs.push(file.id)
        state.activeTabId = file.id
      }
      if (parentId) {
        const idx = state.expandedFolderIds.indexOf(parentId)
        if (idx === -1) state.expandedFolderIds.push(parentId)
      }
      syncToBackend(state)
    },

    // 删除文件/文件夹
    deleteFile(state, action: PayloadAction<string>) {
      const collectIds = (id: string): string[] => {
        const children = state.files.filter(f => f.parentId === id)
        return [id, ...children.flatMap(c => collectIds(c.id))]
      }
      const ids = new Set(collectIds(action.payload))
      state.files = state.files.filter(f => !ids.has(f.id))
      state.openTabs = state.openTabs.filter(id => !ids.has(id))
      if (state.activeTabId && ids.has(state.activeTabId)) {
        state.activeTabId = state.openTabs[0] ?? null
      }
      state.expandedFolderIds = state.expandedFolderIds.filter(id => !ids.has(id))
      syncToBackend(state)
    },

    // 重命名文件
    renameFile(state, action: PayloadAction<{ id: string; name: string }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.name = action.payload.name
        if (file.metadata) file.metadata.updatedAt = now()
      }
      syncToBackend(state)
    },

    // 更新文件内容
    updateFileContent(state, action: PayloadAction<{ id: string; content: string }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.content = action.payload.content
        if (file.metadata) file.metadata.updatedAt = now()
      }
      syncToBackend(state)
    },

    // 打开文件
    openTab(state, action: PayloadAction<string>) {
      if (!state.openTabs.includes(action.payload)) {
        state.openTabs.push(action.payload)
      }
      state.activeTabId = action.payload
      syncToBackend(state)
    },

    // 关闭文件
    closeTab(state, action: PayloadAction<string>) {
      const idx = state.openTabs.indexOf(action.payload)
      if (idx === -1) return
      state.openTabs.splice(idx, 1)
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.openTabs[Math.min(idx, state.openTabs.length - 1)] ?? null
      }
      syncToBackend(state)
    },

    // 激活文件
    setActiveTab(state, action: PayloadAction<string>) {
      state.activeTabId = action.payload
      syncToBackend(state)
    },

    // 切换文件夹
    toggleFolder(state, action: PayloadAction<string>) {
      const idx = state.expandedFolderIds.indexOf(action.payload)
      if (idx === -1) state.expandedFolderIds.push(action.payload)
      else state.expandedFolderIds.splice(idx, 1)
      syncToBackend(state)
    },

    // 折叠所有文件
    collapseAllFolders(state) {
      state.expandedFolderIds = []
      syncToBackend(state)
    },

    // 切换侧边栏
    setSidebarPanel(state, action: PayloadAction<SidebarPanel>) {
      state.sidebarPanel = action.payload
      if (!state.sidebarVisible) state.sidebarVisible = true
      syncToBackend(state)
    },

    // 切换侧边栏
    toggleSidebar(state) {
      state.sidebarVisible = !state.sidebarVisible
      syncToBackend(state)
    },

    // 移动文件
    moveFile(state, action: PayloadAction<{ id: string; newParentId: string | null }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.parentId = action.payload.newParentId
        if (file.metadata) file.metadata.updatedAt = now()
      }
      syncToBackend(state)
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
      state.openTabs = state.openTabs.filter(id => !allIds.has(id))
      if (state.activeTabId && allIds.has(state.activeTabId)) {
        state.activeTabId = state.openTabs[0] ?? null
      }
      state.expandedFolderIds = state.expandedFolderIds.filter(id => !allIds.has(id))
      syncToBackend(state)
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
          metadata: { createdAt: ts, updatedAt: ts, tags: [] },
        })
      }
      syncToBackend(state)
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
      syncToBackend(state)
    },
  },

  // 异步处理
  extraReducers: (builder) => {
    builder.addCase(loadPathWorkspace.fulfilled, (state, action) => {
      const { userId, data } = action.payload
      state.storageUserId = userId
      if (!userId) return

      // 优先使用后端数据
      if (data && (data.files as VFile[])?.length) {
        state.files = data.files as VFile[]
        state.openTabs = data.openTabs ?? []
        state.activeTabId = data.activeTabId ?? null
        state.expandedFolderIds = data.expandedFolderIds ?? []
        state.activePlan = (data.activePlan as GrowthPlan) ?? null
        state.mentorId = data.mentorId ?? null
        // 同步写入 localStorage 作为离线缓存
        localStorage.setItem(getStorageKey(userId), JSON.stringify(data))
        return
      }

      // 后端无数据时 fallback 到 localStorage（兼容旧数据迁移）
      const saved = loadFromStorage(userId)
      if (saved.files?.length) {
        state.files = saved.files
        state.openTabs = saved.openTabs ?? []
        state.activeTabId = saved.activeTabId ?? null
        state.expandedFolderIds = saved.expandedFolderIds ?? []
        state.activePlan = saved.activePlan ?? null
        state.mentorId = saved.mentorId ?? null
      }
      // 首次加载（后端无数据）时，将当前状态同步到后端
      syncToBackend(state)
    })
  },
})

export const {
  createFile, deleteFile, renameFile, updateFileContent, moveFile,
  batchDeleteFiles, batchCreateFiles, sortFiles,
  openTab, closeTab, setActiveTab,
  toggleFolder, collapseAllFolders,
  setSidebarPanel, toggleSidebar,
} = pathSlice.actions

export default pathSlice.reducer
