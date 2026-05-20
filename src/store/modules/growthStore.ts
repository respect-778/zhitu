import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { VFile, GrowthPlan, SidebarPanel } from '@/types/growth'

interface GrowthState {
  files: VFile[]                  // 虚拟文件系统（扁平数组，通过 parentId 组织树形）
  openTabs: string[]              // 已打开的标签页 file id 列表
  activeTabId: string | null      // 当前激活的标签页 id
  sidebarPanel: SidebarPanel      // 侧栏当前面板：files | search | plan | mentor
  sidebarVisible: boolean         // 侧栏是否可见
  expandedFolderIds: string[]     // 已展开的文件夹 id 列表
  activePlan: GrowthPlan | null   // 当前成长计划（暂未使用，预留）
  mentorId: string | null         // 当前导师 id
  storageUserId: string           // localStorage 持久化用的用户标识
}

const STORAGE_KEY_PREFIX = 'zhitu_growth'
const getStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}_${userId}`

// 从 localStorage 加载用户工作区数据
const loadFromStorage = (userId: string): Partial<GrowthState> => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// 每次 state 变更后写入 localStorage 持久化
const persistState = (state: GrowthState) => {
  if (!state.storageUserId) return
  const data = {
    files: state.files,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    expandedFolderIds: state.expandedFolderIds,
    activePlan: state.activePlan,
    mentorId: state.mentorId,
  }
  localStorage.setItem(getStorageKey(state.storageUserId), JSON.stringify(data))
}

const now = () => new Date().toISOString()

const DEFAULT_FILES: VFile[] = [
  { id: 'folder-plan', name: '我的规划', type: 'folder', parentId: null, order: 0 },
  {
    id: 'file-plan-30d', name: '30天计划', type: 'file', parentId: 'folder-plan', fileType: 'plan', order: 0,
    content: '# 我的30天学习计划\n\n## 目标\n\n在30天内系统学习前端开发，掌握 React 核心技术栈。\n\n## 第1周：基础入门\n\n- [x] 理解 JSX 与组件思维\n- [x] 掌握 useState / useEffect\n- [ ] 完成3个小练习项目\n- [ ] 阅读1篇 React 设计哲学文章\n\n## 第2周：状态管理\n\n- [ ] 学习 React Router\n- [ ] 理解 Redux 核心概念\n- [ ] 搭建项目脚手架\n\n## 第3周：项目实战\n\n- [ ] 开发核心功能模块\n- [ ] 接入后端 API\n\n## 第4周：完善与复盘\n\n- [ ] 项目部署上线\n- [ ] 编写文档\n- [ ] 成长复盘总结',
    metadata: { createdAt: now(), updatedAt: now(), tags: ['计划'] },
  },
  { id: 'folder-notes', name: '学习笔记', type: 'folder', parentId: null, order: 1 },
  {
    id: 'file-note-1', name: 'React Hook 学习心得', type: 'file', parentId: 'folder-notes', fileType: 'note', order: 0,
    content: '# React Hook 学习心得\n\n今天学了 useEffect 的清理机制，之前一直搞混依赖数组的作用。\n\n## 关键要点\n\n- useEffect 默认每次渲染后执行\n- 空数组 `[]` 只在挂载时执行\n- 返回函数用于清理副作用\n\n> 如果你不能把 useEffect 解释给一个不懂 React 的人听，说明你还没真正理解它。',
    metadata: { createdAt: now(), updatedAt: now(), tags: ['react', 'hooks'] },
  },
  {
    id: 'file-note-2', name: 'Redux 状态管理', type: 'file', parentId: 'folder-notes', fileType: 'note', order: 1,
    content: '# Redux 状态管理笔记\n\nRedux 的核心思想其实就是一个函数：\n\n```\n(oldState, action) => newState\n```\n\n## 三个原则\n\n1. 单一数据源\n2. State 是只读的\n3. 使用纯函数修改',
    metadata: { createdAt: now(), updatedAt: now(), tags: ['redux'] },
  },
  { id: 'folder-cite', name: '引用收藏', type: 'folder', parentId: null, order: 2 },
  {
    id: 'file-cite-1', name: 'React 19 新特性解读', type: 'file', parentId: 'folder-cite', fileType: 'article_cite', order: 0,
    content: '# React 19 新特性解读\n\n> 引用自知识广场\n\nReact 19 带来了多项重要更新...\n\n- React Compiler\n- Server Components\n- Actions\n- use() Hook',
    metadata: { createdAt: now(), updatedAt: now(), sourceType: 'community', tags: ['react'] },
  },
  { id: 'folder-summary', name: '周总结', type: 'folder', parentId: null, order: 3 },
  {
    id: 'file-summary-1', name: '第1周 - 成长回顾', type: 'file', parentId: 'folder-summary', fileType: 'weekly_summary', order: 0,
    content: '# 第1周成长回顾\n\n这周你在 React 基础上花了不少时间，从「这是什么」到「原来如此」的过程很扎实。\n\n你知道吗？React 最核心的理念其实就是一个公式：\n\n```\nUI = f(state)\n```\n\n就这么简单。如果你能用这一句话解释给室友听，那你就真的懂了。\n\n---\n\n**本周数据：**\n- 完成任务: 4/6\n- 学习笔记: 2篇\n- 引用文章: 1篇',
    metadata: { createdAt: now(), updatedAt: now(), mentorId: 'feynman', tags: ['周总结'] },
  },
  { id: 'folder-archive', name: '成长档案', type: 'folder', parentId: null, order: 4 },
  {
    id: 'file-quick', name: '快速笔记', type: 'file', parentId: null, fileType: 'note', order: 5,
    content: '',
    metadata: { createdAt: now(), updatedAt: now(), tags: [] },
  },
]

const initialState: GrowthState = {
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

const growthSlice = createSlice({
  name: 'growth',
  initialState,
  reducers: {
    // 加载用户工作区：从 localStorage 恢复文件、标签页等状态
    loadGrowthWorkspace(state, action: PayloadAction<string>) {
      const userId = action.payload.trim()
      state.storageUserId = userId
      if (!userId) return
      const saved = loadFromStorage(userId)
      if (saved.files?.length) {
        state.files = saved.files
        state.openTabs = saved.openTabs ?? []
        state.activeTabId = saved.activeTabId ?? null
        state.expandedFolderIds = saved.expandedFolderIds ?? []
        state.activePlan = saved.activePlan ?? null
        state.mentorId = saved.mentorId ?? null
      }
    },

    // 新建文件/文件夹，自动打开新文件的标签页并展开父文件夹
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
      persistState(state)
    },

    // 删除文件/文件夹（递归删除子节点），同时清理相关标签页
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
      persistState(state)
    },

    // 重命名文件/文件夹
    renameFile(state, action: PayloadAction<{ id: string; name: string }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.name = action.payload.name
        if (file.metadata) file.metadata.updatedAt = now()
      }
      persistState(state)
    },

    // 更新文件内容（编辑器输入时触发）
    updateFileContent(state, action: PayloadAction<{ id: string; content: string }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.content = action.payload.content
        if (file.metadata) file.metadata.updatedAt = now()
      }
      persistState(state)
    },

    // 打开标签页（不重复添加），并设为激活状态
    openTab(state, action: PayloadAction<string>) {
      if (!state.openTabs.includes(action.payload)) {
        state.openTabs.push(action.payload)
      }
      state.activeTabId = action.payload
      persistState(state)
    },

    // 关闭标签页，自动切换到相邻标签
    closeTab(state, action: PayloadAction<string>) {
      const idx = state.openTabs.indexOf(action.payload)
      if (idx === -1) return
      state.openTabs.splice(idx, 1)
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.openTabs[Math.min(idx, state.openTabs.length - 1)] ?? null
      }
      persistState(state)
    },

    // 切换激活的标签页
    setActiveTab(state, action: PayloadAction<string>) {
      state.activeTabId = action.payload
      persistState(state)
    },

    // 展开/折叠文件夹
    toggleFolder(state, action: PayloadAction<string>) {
      const idx = state.expandedFolderIds.indexOf(action.payload)
      if (idx === -1) state.expandedFolderIds.push(action.payload)
      else state.expandedFolderIds.splice(idx, 1)
      persistState(state)
    },

    // 折叠所有文件夹
    collapseAllFolders(state) {
      state.expandedFolderIds = []
      persistState(state)
    },

    // 切换侧栏面板（同时确保侧栏可见）
    setSidebarPanel(state, action: PayloadAction<SidebarPanel>) {
      state.sidebarPanel = action.payload
      if (!state.sidebarVisible) state.sidebarVisible = true
      persistState(state)
    },

    // 切换侧栏显示/隐藏
    toggleSidebar(state) {
      state.sidebarVisible = !state.sidebarVisible
      persistState(state)
    },

    // 移动文件到另一个文件夹
    moveFile(state, action: PayloadAction<{ id: string; newParentId: string | null }>) {
      const file = state.files.find(f => f.id === action.payload.id)
      if (file) {
        file.parentId = action.payload.newParentId
        if (file.metadata) file.metadata.updatedAt = now()
      }
      persistState(state)
    },

    // 按名称/创建时间/修改时间排序，文件夹始终排在文件前面
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
      persistState(state)
    },
  },
})

export const {
  loadGrowthWorkspace,
  createFile, deleteFile, renameFile, updateFileContent, moveFile, sortFiles,
  openTab, closeTab, setActiveTab,
  toggleFolder, collapseAllFolders,
  setSidebarPanel, toggleSidebar,
} = growthSlice.actions

export default growthSlice.reducer
