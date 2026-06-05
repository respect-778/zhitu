import type React from 'react'
import { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { message } from 'antd'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  loadPathWorkspace,
  createFile, deleteFile, renameFile, updateFileContent,
  moveFile, batchDeleteFiles, batchCreateFiles,
  openTab, closeTab, setActiveTab,
  toggleFolder, collapseAllFolders,
  setSidebarPanel, toggleSidebar, sortFiles,
  flushSync,
} from '@/store/modules/pathStore'
import type { SidebarPanel } from '@/types/path'
import ActivityBar from './components/ActivityBar'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import EditorArea from './components/EditorArea'
import StatusBar from './components/StatusBar'
import { getMentor } from './data/mentors'
import QuickSwitcher from './components/QuickSwitcher'
import styles from './index.module.less'


/** 成长规划主页面 — 仿 Obsidian 三栏布局：ActivityBar | Sidebar | MainArea */
const Path: React.FC = () => {
  const dispatch = useAppDispatch()
  const userId = useAppSelector(state => state.user.userId)
  const {
    files, openTabs, activeTabId,
    sidebarPanel, sidebarVisible, expandedFolderIds,
    mentorId,
  } = useAppSelector(state => state.path)

  // 标签页前进/后退导航历史
  const [navHistory, setNavHistory] = useState<string[]>([])
  const [navIndex, setNavIndex] = useState(-1)
  const [isClose, setIsClose] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphActive, setGraphActive] = useState(false)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const isNavAction = useRef(false)

  // 初始化：加载用户工作区数据
  useEffect(() => {
    if (userId) dispatch(loadPathWorkspace(userId))
  }, [dispatch, userId])

  // 监听 activeTabId 变化，维护导航历史栈
  useEffect(() => {
    if (!activeTabId || isNavAction.current) {
      isNavAction.current = false
      return
    }
    setNavHistory(prev => {
      const sliced = prev.slice(0, navIndex + 1)
      return [...sliced, activeTabId]
    })
    setNavIndex(prev => prev + 1)
  }, [activeTabId])

  // 派生数据：标签页对应的文件对象列表
  const tabFiles = useMemo(() =>
    openTabs.map(id => files.find(f => f.id === id)).filter(Boolean) as typeof files,
    [openTabs, files]
  )

  // 派生数据：当前激活文件
  const activeFile = useMemo(() =>
    activeTabId ? files.find(f => f.id === activeTabId) ?? null : null,
    [activeTabId, files]
  )

  // 派生数据：文件总数（不含文件夹）
  const fileCount = useMemo(() => files.filter(f => f.type === 'file').length, [files])

  // 派生数据：当前文件字数（去除空白字符）
  const wordCount = useMemo(() => {
    if (!activeFile?.content) return 0
    return activeFile.content.replace(/\s/g, '').length
  }, [activeFile?.content])

  const mentor = mentorId ? getMentor(mentorId) : getMentor('feynman')

  const canGoBack = navIndex > 0
  const canGoForward = navIndex < navHistory.length - 1

  // 切换侧栏显示/隐藏
  const handleToggleSidebar = useCallback(() => {
    dispatch(toggleSidebar())
    setIsClose(!isClose)
  }, [isClose, dispatch])

  // 导航后退
  const handleNavBack = useCallback(() => {
    if (!canGoBack) return
    isNavAction.current = true
    const newIdx = navIndex - 1
    setNavIndex(newIdx)
    dispatch(setActiveTab(navHistory[newIdx]))
  }, [navIndex, navHistory, canGoBack, dispatch])

  // 导航前进
  const handleNavForward = useCallback(() => {
    if (!canGoForward) return
    isNavAction.current = true
    const newIdx = navIndex + 1
    setNavIndex(newIdx)
    dispatch(setActiveTab(navHistory[newIdx]))
  }, [navIndex, navHistory, canGoForward, dispatch])

  // 切换侧栏面板
  const handlePanelChange = useCallback((panel: SidebarPanel) => {
    dispatch(setSidebarPanel(panel))
  }, [dispatch])

  // 选中文件 → 打开标签页
  const handleSelectFile = useCallback((id: string) => {
    dispatch(openTab(id))
  }, [dispatch])

  // 新建文件或文件夹
  const handleCreateFile = useCallback((parentId: string | null, type: 'file' | 'folder') => {
    const name = type === 'folder' ? '新建文件夹' : '未命名笔记'
    dispatch(createFile({ name, type, parentId }))
  }, [dispatch])

  // 编辑器内容变更回调
  const handleContentChange = useCallback((id: string, content: string) => {
    dispatch(updateFileContent({ id, content }))
  }, [dispatch])

  // 重命名文件（含同级重名校验），返回是否成功
  const handleRenameFile = useCallback((id: string, name: string): boolean => {
    const target = files.find(f => f.id === id)
    if (!target) return false
    const duplicate = files.some(f => f.id !== id && f.parentId === target.parentId && f.name === name)
    if (duplicate) return false
    dispatch(renameFile({ id, name }))
    return true
  }, [files, dispatch])

  // 导入多个文件（md/txt/markdown）
  const handleImportFiles = useCallback(async (fileList: FileList) => {
    for (const f of Array.from(fileList)) {
      const content = await f.text()
      const name = f.name.replace(/\.(md|txt|markdown)$/, '')
      dispatch(createFile({ name, type: 'file', parentId: null, content }))
    }
    message.success(`已导入 ${fileList.length} 个文件`)
  }, [dispatch])

  // 导入文件夹（解析 webkitRelativePath 重建目录层级）
  const handleImportFolder = useCallback(async (fileList: FileList) => {
    const folderIdMap = new Map<string, string>()
    let importCount = 0

    for (const f of Array.from(fileList)) {
      const relativePath = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name
      const parts = relativePath.split('/')

      let currentParentId: string | null = null
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join('/')
        if (!folderIdMap.has(folderPath)) {
          const folderId = crypto.randomUUID()
          folderIdMap.set(folderPath, folderId)
          dispatch(createFile({ name: parts[i], type: 'folder', parentId: currentParentId }))
        }
        currentParentId = folderIdMap.get(folderPath) ?? null
      }

      if (/\.(md|txt|markdown)$/i.test(f.name)) {
        const content = await f.text()
        const name = f.name.replace(/\.(md|txt|markdown)$/i, '')
        dispatch(createFile({ name, type: 'file', parentId: currentParentId, content }))
        importCount++
      }
    }
    message.success(`已导入 ${importCount} 个文件`)
  }, [dispatch])

  // 文件排序
  const handleSort = useCallback((by: 'name' | 'created' | 'updated') => {
    dispatch(sortFiles(by))
    message.success(`已按${by === 'name' ? '名称' : by === 'created' ? '创建时间' : '修改时间'}排序`)
  }, [dispatch])

  // 全局快捷键：Alt+N 新建笔记，Ctrl+O 打开快速切换器
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'n') {
        e.preventDefault()
        handleCreateFile(null, 'file')
      } else if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        setQuickSwitcherOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCreateFile])

  useEffect(() => {
    // 定义 beforeunload 的回调
    const handler = () => flushSync()

    // 注册监听：：浏览器刷新、关标签页、输入新 URL 时触发
    window.addEventListener('beforeunload', handler)

    return () => {
      // 浏览器原生事件，SPA 路由跳转不会触发
      window.removeEventListener('beforeunload', handler)

      flushSync() // SPA 路由跳转时处理，原生事件是不会处理的
    }
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.workspace}>
        <ActivityBar activePanel={sidebarPanel} isClose={isClose} showingGraph={graphOpen} onPanelChange={handlePanelChange} onToggleSidebar={handleToggleSidebar} onShowGraph={() => { if (graphOpen) { setGraphOpen(false); setGraphActive(false) } else { setGraphOpen(true); setGraphActive(true) } }} />

        <div className={`${styles.sidebarWrap} ${!sidebarVisible ? styles.sidebarCollapsed : ''}`}>
          <Sidebar
            files={files}
            expandedIds={expandedFolderIds}
            activeFileId={activeTabId}
            activePanel={sidebarPanel}
            mentorId={mentorId}
            onToggleFolder={(id) => dispatch(toggleFolder(id))}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onDeleteFile={(id) => dispatch(deleteFile(id))}
            onRenameFile={(id, name) => { handleRenameFile(id, name) }}
            onMoveFile={(id, newParentId) => dispatch(moveFile({ id, newParentId }))}
            onBatchDeleteFiles={(ids) => dispatch(batchDeleteFiles(ids))}
            onBatchCreateFiles={(items) => dispatch(batchCreateFiles(items))}
            onImportFiles={handleImportFiles}
            onImportFolder={handleImportFolder}
            onCollapseAll={() => dispatch(collapseAllFolders())}
            onSort={handleSort}
          />
        </div>

        <div className={styles.mainArea}>
          <TabBar
            tabs={tabFiles}
            activeTabId={activeTabId}
            showGraph={graphOpen}
            graphActive={graphActive}
            onSelect={(id) => { setGraphActive(false); dispatch(setActiveTab(id)) }}
            onClose={(id) => dispatch(closeTab(id))}
            onCloseGraph={() => { setGraphOpen(false); setGraphActive(false) }}
            onSelectGraph={() => setGraphActive(true)}
            onNew={() => handleCreateFile(null, 'file')}
          />
          <EditorArea
            file={activeFile}
            files={files}
            showGraph={graphActive}
            onContentChange={handleContentChange}
            onRenameFile={handleRenameFile}
            onSelectFile={(id) => { setGraphActive(false); handleSelectFile(id) }}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onNavBack={handleNavBack}
            onNavForward={handleNavForward}
            onCreateFile={() => handleCreateFile(null, 'file')}
          />
        </div>
      </div>

      <StatusBar
        mentorName={mentor?.nameZh}
        fileCount={fileCount}
        wordCount={wordCount}
      />

      <QuickSwitcher
        visible={quickSwitcherOpen}
        files={files}
        onSelect={(id) => { setGraphActive(false); handleSelectFile(id) }}
        onClose={() => setQuickSwitcherOpen(false)}
        onCreate={() => handleCreateFile(null, 'file')}
      />
    </div>
  )
}

export default Path
