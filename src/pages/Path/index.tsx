import type React from 'react'
import { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { Alert, Button, message } from 'antd'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  loadPathWorkspace,
  createFile, deleteFile, renameFile, updateFileContent,
  moveFile, batchDeleteFiles, batchCreateFiles,
  openTab, closeTab, closeAllTabs, setActiveTab,
  toggleFolder, collapseAllFolders, expandAllFolders,
  setSidebarPanel, setSidebarVisible, toggleSidebar, sortFiles,
  flushSync,
  workspaceSaveQueue,
  recoverPathWorkspace,
} from '@/store/modules/pathStore'
import type { SidebarPanel } from '@/types/path'
import ActivityBar from './components/ActivityBar'
import WorkspaceHeader from './components/WorkspaceHeader'
import Sidebar from './components/Sidebar'
import ResizableSidebar, { DEFAULT_SIDEBAR_WIDTH } from './components/ResizableSidebar'
import TabBar from './components/TabBar'
import EditorArea from './components/EditorArea'
import StatusBar from './components/StatusBar'
import PersonalSaveStatus from '@/components/PersonalStorage/PersonalSaveStatus'
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
    mentorId, revision, syncStatus, syncError,
  } = useAppSelector(state => state.path)

  // 标签页前进/后退导航历史
  const [navHistory, setNavHistory] = useState<string[]>([])
  const [navIndex, setNavIndex] = useState(-1)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphActive, setGraphActive] = useState(false)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isNavAction = useRef(false)

  // 初始化：加载用户工作区数据
  useEffect(() => {
    let disposed = false
    if (userId) {
      void dispatch(loadPathWorkspace(userId)).then(() => {
        if (!disposed) setRestoredUserId(userId)
      })
    }
    return () => { disposed = true }
  }, [dispatch, userId])

  useEffect(() => {
    const refresh = () => {
      if (userId && document.visibilityState === 'visible') void dispatch(loadPathWorkspace(userId))
    }
    const handleCitation = (event: Event) => {
      if ((event as CustomEvent<{ userId: string }>).detail.userId === userId) refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('zhitu-workspace-updated', handleCitation)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('zhitu-workspace-updated', handleCitation)
    }
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
  }, [dispatch])

  const handleSidebarVisibilityChange = useCallback((visible: boolean) => {
    dispatch(setSidebarVisible(visible))
  }, [dispatch])

  const handleSidebarWidthChange = useCallback((width: number) => {
    // ResizeObserver runs before paint; update layout directly to avoid a React-frame delay.
    containerRef.current?.style.setProperty('--path-sidebar-width', `${width}px`)
  }, [])

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
    setGraphActive(false)
    dispatch(openTab(id))
  }, [dispatch])

  const handleCloseAllTabs = useCallback(() => {
    dispatch(closeAllTabs())
    setGraphOpen(false)
    setGraphActive(false)
    setNavHistory([])
    setNavIndex(-1)
    isNavAction.current = false
  }, [dispatch])

  // 新建文件或文件夹
  const handleCreateFile = useCallback((parentId: string | null, type: 'file' | 'folder') => {
    const name = type === 'folder' ? '新建文件夹' : '未命名笔记'
    setGraphActive(false)
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
          dispatch(createFile({ id: folderId, name: parts[i], type: 'folder', parentId: currentParentId }))
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
    const handler = () => { void flushSync(true) }

    // 注册监听：：浏览器刷新、关标签页、输入新 URL 时触发
    window.addEventListener('beforeunload', handler)

    return () => {
      // 浏览器原生事件，SPA 路由跳转不会触发
      window.removeEventListener('beforeunload', handler)

      void flushSync()
    }
  }, [])

  return (
    <div ref={containerRef} className={styles.container}>
      {(syncStatus === 'error' || syncStatus === 'conflict') && (
        <Alert
          type="warning"
          showIcon
          title={syncError || '本地修改尚未同步'}
          action={syncStatus === 'conflict' ? (
            <Button size="small" loading={recovering} onClick={async () => {
              setRecovering(true)
              try {
                await dispatch(recoverPathWorkspace(userId)).unwrap()
                message.success('已保留本地笔记副本并更新工作区')
              } catch {
                message.error('更新失败，本地修改仍保留')
              } finally {
                setRecovering(false)
              }
            }}>保留副本并更新</Button>
          ) : (
            <Button size="small" onClick={() => {
              if (revision === null || !workspaceSaveQueue.peek(userId)?.pending) void dispatch(loadPathWorkspace(userId))
              else void flushSync()
            }}>重试同步</Button>
          )}
        />
      )}
      <div className={styles.topRow}>
        <div className={`${styles.topSidebar} ${sidebarVisible ? '' : styles.sidebarCollapsed}`} style={{ width: `max(148px, calc(46px + var(--path-sidebar-width, ${DEFAULT_SIDEBAR_WIDTH}px)))` }}>
          <WorkspaceHeader
            activePanel={sidebarPanel}
            sidebarVisible={sidebarVisible}
            onPanelChange={handlePanelChange}
            onToggleSidebar={handleToggleSidebar}
          />
        </div>
        <TabBar
          tabs={tabFiles}
          activeTabId={activeTabId}
          showGraph={graphOpen}
          graphActive={graphActive}
          restoring={restoredUserId !== userId}
          onSelect={handleSelectFile}
          onClose={(id) => dispatch(closeTab(id))}
          onCloseGraph={() => { setGraphOpen(false); setGraphActive(false) }}
          onCloseAll={handleCloseAllTabs}
          onSelectGraph={() => setGraphActive(true)}
          onNew={() => handleCreateFile(null, 'file')}
        />
      </div>
      <div className={styles.workspace} style={recovering ? { pointerEvents: 'none' } : undefined}>
        <ActivityBar
          onShowMentor={() => handlePanelChange('mentor')}
          onShowGraph={() => {
            setGraphOpen(true)
            setGraphActive(true)
          }}
        />

        <ResizableSidebar visible={sidebarVisible} onVisibilityChange={handleSidebarVisibilityChange} onWidthChange={handleSidebarWidthChange}>
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
            onExpandAll={() => dispatch(expandAllFolders())}
            onCollapseAll={() => dispatch(collapseAllFolders())}
            onSort={handleSort}
          />
        </ResizableSidebar>

        <div className={styles.mainArea} data-testid="path-main-area">
          <EditorArea
            file={activeFile}
            files={files}
            showGraph={graphActive}
            onContentChange={handleContentChange}
            onRenameFile={handleRenameFile}
            onSelectFile={handleSelectFile}
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
        saveStatus={<PersonalSaveStatus kind="workspace" />}
      />

      <QuickSwitcher
        visible={quickSwitcherOpen}
        files={files}
        onSelect={handleSelectFile}
        onClose={() => setQuickSwitcherOpen(false)}
        onCreate={() => handleCreateFile(null, 'file')}
      />
    </div>
  )
}

export default Path
