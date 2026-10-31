import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  EditOutlined,
  FolderAddOutlined,
  SortAscendingOutlined,
  MinusSquareOutlined,
  PlusSquareOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  RightOutlined,
  DeleteOutlined,
  FormOutlined,
  ImportOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import { Dropdown, Input, Modal, message } from 'antd'
import type { VFile, SidebarPanel, AgentPermission } from '@/types/path'
import MentorPanel from './panels/MentorPanel/MentorPanel'
import SearchPanel from './panels/SearchPanel/SearchPanel'
import PermissionPanel, { type PermissionRequest } from './panels/PermissionPanel/PermissionPanel'
import MarkdownGuidePanel from './panels/MarkdownGuidePanel/MarkdownGuidePanel'
import { AGENT_PERMISSION_LABEL, getStoredAgentPermission } from '../../utils/wikiPermissions'
import styles from './index.module.less'

interface Props {
  files: VFile[]
  expandedIds: string[]
  activeFileId: string | null
  activePanel: SidebarPanel
  mentorId: string | null
  onToggleFolder: (id: string) => void
  onSelectFile: (id: string) => void
  onCreateFile: (parentId: string | null, type: 'file' | 'folder') => void
  onDeleteFile: (id: string) => void
  onRenameFile: (id: string, name: string) => void
  onBatchMoveFiles: (ids: string[], newParentId: string | null) => boolean | Promise<boolean>
  onBatchDeleteFiles: (ids: string[]) => void
  onBatchCreateFiles: (items: Array<{
    id: string; name: string; type: 'file' | 'folder';
    parentId: string | null; content?: string; fileType?: VFile['fileType']; order: number;
  }>) => void
  onImportFiles: (files: FileList) => void
  onImportFolder: (files: FileList) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onSort: (by: 'name' | 'created' | 'updated') => void
  permissionRequest: PermissionRequest | null
  onPermissionRequestHandled: () => void
  onRequestAgentPermission: (id: string, permission: AgentPermission) => void
  onSetAgentPermissions: (ids: string[], permission: AgentPermission) => void
}

function buildTree(files: VFile[], parentId: string | null): VFile[] {
  return files
    .filter(f => f.parentId === parentId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.order - b.order
    })
}

function flattenVisibleTree(files: VFile[], expandedIds: string[], parentId: string | null = null): VFile[] {
  const children = buildTree(files, parentId)
  const result: VFile[] = []
  for (const child of children) {
    result.push(child)
    if (child.type === 'folder' && expandedIds.includes(child.id)) {
      result.push(...flattenVisibleTree(files, expandedIds, child.id))
    }
  }
  return result
}

function isDescendant(files: VFile[], parentId: string | null, ancestorId: string): boolean {
  if (!parentId) return false
  if (parentId === ancestorId) return true
  const parent = files.find(f => f.id === parentId)
  return parent ? isDescendant(files, parent.parentId, ancestorId) : false
}

function topLevelSelection(files: VFile[], ids: Iterable<string>): string[] {
  const selected = new Set(ids)
  return Array.from(selected).filter(id => {
    let parentId = files.find(file => file.id === id)?.parentId ?? null
    while (parentId) {
      if (selected.has(parentId)) return false
      parentId = files.find(file => file.id === parentId)?.parentId ?? null
    }
    return true
  })
}

interface PointerDragSession {
  pointerId: number
  captureElement: HTMLElement
  startX: number
  startY: number
  ids: string[]
  dragging: boolean
  targetId: string | null
  targetValid: boolean
  targetReason: string
}

interface DragPresentation {
  x: number
  y: number
  ids: string[]
  targetId: string | null
  targetValid: boolean
  targetReason: string
}

let clipboard: VFile[] = []

/** 文件树节点 */
const FileTreeNode: React.FC<{
  file: VFile
  files: VFile[]
  depth: number
  expandedIds: string[]
  activeFileId: string | null
  selectedIds: Set<string>
  renamingId: string | null
  renameValue: string
  draggedIds: Set<string>
  dropTargetId: string | null
  dropTargetValid: boolean
  onNodeClick: (id: string, e: React.MouseEvent) => void
  onToggleFolder: (id: string) => void
  onDeleteFile: (id: string) => void
  onCreateFile: (parentId: string | null, type: 'file' | 'folder') => void
  onStartRename: (id: string, currentName: string) => void
  onRenameChange: (value: string) => void
  onRenameConfirm: () => void
  onRenameCancel: () => void
  onContextMenu: (id: string, e: React.MouseEvent) => void
  onRequestAgentPermission: (id: string, permission: AgentPermission) => void
}> = ({ file, files, depth, expandedIds, activeFileId, selectedIds, renamingId, renameValue, draggedIds, dropTargetId, dropTargetValid, onNodeClick, onToggleFolder, onDeleteFile, onCreateFile, onStartRename, onRenameChange, onRenameConfirm, onRenameCancel, onContextMenu, onRequestAgentPermission }) => {
  const isFolder = file.type === 'folder'
  const isExpanded = expandedIds.includes(file.id)
  const isActive = file.id === activeFileId
  const isSelected = selectedIds.has(file.id)
  const isRenaming = file.id === renamingId
  const isDragging = draggedIds.has(file.id)
  const isDropTarget = dropTargetId === file.id
  const children = isFolder ? buildTree(files, file.id) : []

  const singleMenuItems = [
    ...(isFolder ? [
      { key: 'newFile', label: '新建笔记', icon: <EditOutlined /> },
      { key: 'newFolder', label: '新建文件夹', icon: <FolderAddOutlined /> },
      { type: 'divider' as const },
    ] : []),
    { key: 'rename', label: '重命名', icon: <FormOutlined /> },
    {
      key: 'agentPermission',
      label: 'Agent 权限',
      children: (Object.keys(AGENT_PERMISSION_LABEL) as AgentPermission[]).map(permission => ({
        key: `permission:${permission}`,
        label: `${getStoredAgentPermission(file) === permission ? '✓ ' : ''}${AGENT_PERMISSION_LABEL[permission]}`,
      })),
    },
    { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
  ]

  const handleSingleMenuClick = ({ key }: { key: string }) => {
    if (key === 'rename') onStartRename(file.id, file.name)
    else if (key === 'delete') {
      Modal.confirm({
        title: '确认删除',
        content: isFolder
          ? `将删除文件夹「${file.name}」及其所有内容，此操作不可撤销。`
          : `将删除「${file.name}」，此操作不可撤销。`,
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        centered: true,
        onOk: () => onDeleteFile(file.id),
      })
    }
    else if (key === 'newFile') onCreateFile(file.id, 'file')
    else if (key === 'newFolder') onCreateFile(file.id, 'folder')
    else if (key.startsWith('permission:')) onRequestAgentPermission(file.id, key.slice('permission:'.length) as AgentPermission)
  }

  const nodeClassName = [
    styles.treeNode,
    isActive ? styles.active : '',
    isSelected ? styles.selected : '',
    isDragging ? styles.dragging : '',
    isDropTarget ? (dropTargetValid ? styles.dropTarget : styles.invalidDropTarget) : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <Dropdown
        menu={{ items: singleMenuItems, onClick: handleSingleMenuClick }}
        trigger={['contextMenu']}
        disabled={isSelected && selectedIds.size > 1}
      >
        <div
          className={nodeClassName}
          style={{ paddingLeft: 12 + depth * 16 }}
          data-file-id={file.id}
          data-file-type={file.type}
          onClick={(e) => onNodeClick(file.id, e)}
          onContextMenu={(e) => onContextMenu(file.id, e)}
        >
          {isFolder ? (
            <span className={`${styles.arrow} ${isExpanded ? styles.arrowExpanded : ''}`} data-drag-ignore="true">
              <RightOutlined />
            </span>
          ) : (
            <span className={styles.arrow} />
          )}
          <span className={styles.nodeIcon}>
            {isFolder
              ? (isExpanded ? <FolderOpenOutlined /> : <FolderOutlined />)
              : <FileTextOutlined />
            }
          </span>
          {isRenaming ? (
            <Input
              size="small"
              value={renameValue}
              onChange={e => onRenameChange(e.target.value)}
              onPressEnter={onRenameConfirm}
              onBlur={onRenameConfirm}
              onKeyDown={e => e.key === 'Escape' && onRenameCancel()}
              autoFocus
              className={styles.renameInput}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className={styles.nodeName}>{file.name}</span>
          )}
        </div>
      </Dropdown>
      {isFolder && (
        <div className={`${styles.folderChildren} ${isExpanded ? styles.folderExpanded : ''}`}>
          <div className={styles.folderChildrenInner}>
            {children.map(child => (
              <FileTreeNode
                key={child.id}
                file={child}
                files={files}
                depth={depth + 1}
                expandedIds={expandedIds}
                activeFileId={activeFileId}
                selectedIds={selectedIds}
                renamingId={renamingId}
                renameValue={renameValue}
                draggedIds={draggedIds}
                dropTargetId={dropTargetId}
                dropTargetValid={dropTargetValid}
                onNodeClick={onNodeClick}
                onToggleFolder={onToggleFolder}
                onDeleteFile={onDeleteFile}
                onCreateFile={onCreateFile}
                onStartRename={onStartRename}
                onRenameChange={onRenameChange}
                onRenameConfirm={onRenameConfirm}
                onRenameCancel={onRenameCancel}
                onContextMenu={onContextMenu}
                onRequestAgentPermission={onRequestAgentPermission}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** 文件面板 */
const FileTreePanel: React.FC<Omit<Props, 'activePanel' | 'mentorId'>> = ({
  files, expandedIds, activeFileId,
  onToggleFolder, onSelectFile, onCreateFile, onDeleteFile, onRenameFile,
  onBatchMoveFiles, onBatchDeleteFiles, onBatchCreateFiles,
  onImportFiles, onImportFolder, onExpandAll, onCollapseAll, onSort,
  onRequestAgentPermission,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [draggedIds, setDraggedIds] = useState<Set<string>>(new Set())
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropTargetValid, setDropTargetValid] = useState(false)
  const [dragPresentation, setDragPresentation] = useState<DragPresentation | null>(null)
  const [multiMenuPosition, setMultiMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const dragSessionRef = useRef<PointerDragSession | null>(null)
  const suppressNextClickRef = useRef(false)
  const hoverExpandTimerRef = useRef<number | null>(null)
  const hoverExpandTargetRef = useRef<string | null>(null)

  const rootNodes = buildTree(files, null)
  const folderIds = useMemo(() => files.filter(file => file.type === 'folder').map(file => file.id), [files])
  const allFoldersExpanded = folderIds.length > 0 && folderIds.every(id => expandedIds.includes(id))

  const flatList = useMemo(
    () => flattenVisibleTree(files, expandedIds),
    [files, expandedIds]
  )

  // --- 点击逻辑（多选） ---
  const handleNodeClick = useCallback((id: string, e: React.MouseEvent) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const file = files.find(f => f.id === id)
    if (!file) return

    if (e.shiftKey && lastClickedId) {
      e.preventDefault()
      const idxA = flatList.findIndex(f => f.id === lastClickedId)
      const idxB = flatList.findIndex(f => f.id === id)
      if (idxA !== -1 && idxB !== -1) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA]
        setSelectedIds(new Set(flatList.slice(start, end + 1).map(f => f.id)))
      }
      return
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setLastClickedId(id)
      return
    }

    setSelectedIds(new Set())
    setLastClickedId(id)
    if (file.type === 'folder') onToggleFolder(id)
    else onSelectFile(id)
  }, [files, flatList, lastClickedId, onToggleFolder, onSelectFile])

  // --- 右键菜单 ---
  const handleContextMenu = useCallback((id: string, e: React.MouseEvent) => {
    if (selectedIds.has(id) && selectedIds.size > 1) {
      e.preventDefault()
      e.stopPropagation()
      setMultiMenuPosition({ x: e.clientX, y: e.clientY })
    }
  }, [selectedIds])

  const handleMultiBatchDelete = useCallback(() => {
    setMultiMenuPosition(null)
    Modal.confirm({
      title: '确认删除',
      content: `将删除选中的 ${selectedIds.size} 项及其所有内容，此操作不可撤销。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        onBatchDeleteFiles(Array.from(selectedIds))
        setSelectedIds(new Set())
      },
    })
  }, [selectedIds, onBatchDeleteFiles])

  const handleMultiCopy = useCallback(() => {
    setMultiMenuPosition(null)
    const collectTree = (id: string): VFile[] => {
      const file = files.find(f => f.id === id)
      if (!file) return []
      const children = files.filter(f => f.parentId === id)
      return [file, ...children.flatMap(c => collectTree(c.id))]
    }
    clipboard = [...new Map(
      Array.from(selectedIds).flatMap(id => collectTree(id)).map(f => [f.id, f])
    ).values()]
    message.success(`已复制 ${selectedIds.size} 项`)
  }, [selectedIds, files])

  // --- 复制粘贴快捷键 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) return

      if (e.ctrlKey && e.key === 'c' && selectedIds.size > 0) {
        e.preventDefault()
        const collectTree = (id: string): VFile[] => {
          const file = files.find(f => f.id === id)
          if (!file) return []
          const children = files.filter(f => f.parentId === id)
          return [file, ...children.flatMap(c => collectTree(c.id))]
        }
        clipboard = [...new Map(
          Array.from(selectedIds).flatMap(id => collectTree(id)).map(f => [f.id, f])
        ).values()]
        message.success(`已复制 ${selectedIds.size} 项`)
      }

      if (e.ctrlKey && e.key === 'v' && clipboard.length > 0) {
        e.preventDefault()
        const idMap = new Map<string, string>()
        clipboard.forEach(f => idMap.set(f.id, crypto.randomUUID()))
        const clipboardIdSet = new Set(clipboard.map(f => f.id))
        const rootNames = new Set(files.filter(f => f.parentId === null).map(f => f.name))

        const newFiles = clipboard.map(f => {
          const newParentId = f.parentId && clipboardIdSet.has(f.parentId)
            ? idMap.get(f.parentId)!
            : null
          let newName = f.name
          if (newParentId === null && rootNames.has(newName)) {
            newName = `${newName} (副本)`
            while (rootNames.has(newName)) newName = `${newName} (副本)`
            rootNames.add(newName)
          }
          return {
            id: idMap.get(f.id)!,
            name: newName,
            type: f.type,
            parentId: newParentId,
            content: f.content ?? '',
            fileType: f.fileType,
            order: f.order,
          }
        })
        onBatchCreateFiles(newFiles)
        message.success(`已粘贴 ${newFiles.length} 项`)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [selectedIds, files, onBatchCreateFiles])

  // --- 重命名 ---
  const handleStartRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }, [])

  const handleRenameConfirm = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameFile(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, onRenameFile])

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null)
    setRenameValue('')
  }, [])

  // --- Pointer Events 文件树拖拽（内部移动不使用浏览器原生拖拽截图） ---
  const clearHoverExpandTimer = useCallback(() => {
    if (hoverExpandTimerRef.current !== null) window.clearTimeout(hoverExpandTimerRef.current)
    hoverExpandTimerRef.current = null
    hoverExpandTargetRef.current = null
  }, [])

  const resetPointerDrag = useCallback(() => {
    const session = dragSessionRef.current
    if (session?.captureElement.hasPointerCapture(session.pointerId)) {
      session.captureElement.releasePointerCapture(session.pointerId)
    }
    clearHoverExpandTimer()
    dragSessionRef.current = null
    setDraggedIds(new Set())
    setDropTargetId(null)
    setDropTargetValid(false)
    setDragPresentation(null)
  }, [clearHoverExpandTimer])

  const evaluateDropTarget = useCallback((ids: string[], targetId: string | null) => {
    const target = targetId ? files.find(file => file.id === targetId) : null
    if (targetId && (!target || target.type !== 'folder')) return { valid: false, reason: '只能移动到文件夹' }
    if (targetId && ids.includes(targetId)) return { valid: false, reason: '不能移入自身' }
    if (targetId && ids.some(id => isDescendant(files, targetId, id))) return { valid: false, reason: '不能移入自己的子文件夹' }
    const toMove = ids.filter(id => files.find(file => file.id === id)?.parentId !== targetId)
    if (toMove.length === 0) return { valid: false, reason: '已经位于这里' }
    const siblingNames = new Set(files
      .filter(file => file.parentId === targetId && !ids.includes(file.id))
      .map(file => file.name))
    const conflict = toMove.map(id => files.find(file => file.id === id)).find(file => file && siblingNames.has(file.name))
    if (conflict) return { valid: false, reason: `存在同名项目「${conflict.name}」` }
    return { valid: true, reason: target ? `移动到「${target.name}」` : '移动到根目录' }
  }, [files])

  const updateHoverExpansion = useCallback((targetId: string | null, valid: boolean) => {
    if (!valid || !targetId || expandedIds.includes(targetId)) {
      clearHoverExpandTimer()
      return
    }
    if (hoverExpandTargetRef.current === targetId) return
    clearHoverExpandTimer()
    hoverExpandTargetRef.current = targetId
    hoverExpandTimerRef.current = window.setTimeout(() => {
      onToggleFolder(targetId)
      hoverExpandTimerRef.current = null
      hoverExpandTargetRef.current = null
    }, 600)
  }, [clearHoverExpandTimer, expandedIds, onToggleFolder])

  const handleTreePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType !== 'mouse' || renamingId) return
    const origin = event.target as HTMLElement
    if (origin.closest('[data-drag-ignore="true"],button,input,textarea,a,[contenteditable="true"]')) return
    const row = origin.closest<HTMLElement>('[data-file-id]')
    const id = row?.dataset.fileId
    if (!row || !id) return
    const ids = topLevelSelection(files, selectedIds.has(id) && selectedIds.size > 1 ? selectedIds : [id])
    row.setPointerCapture(event.pointerId)
    dragSessionRef.current = {
      pointerId: event.pointerId,
      captureElement: row,
      startX: event.clientX,
      startY: event.clientY,
      ids,
      dragging: false,
      targetId: null,
      targetValid: false,
      targetReason: '',
    }
  }, [files, renamingId, selectedIds])

  const handleTreePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (!session.dragging && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 5) return
    if (!session.dragging) {
      session.dragging = true
      setDraggedIds(new Set(session.ids))
    }
    event.preventDefault()

    const tree = treeRef.current
    if (tree) {
      const bounds = tree.getBoundingClientRect()
      const edge = 32
      if (event.clientY < bounds.top + edge) tree.scrollTop -= Math.ceil((bounds.top + edge - event.clientY) / 4)
      else if (event.clientY > bounds.bottom - edge) tree.scrollTop += Math.ceil((event.clientY - (bounds.bottom - edge)) / 4)
    }

    const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const rootZone = hit?.closest<HTMLElement>('[data-root-drop-zone="true"]')
    const folderRow = hit?.closest<HTMLElement>('[data-file-type="folder"]')
    const targetId = rootZone ? null : folderRow?.dataset.fileId ?? session.targetId
    const targetWasFound = Boolean(rootZone || folderRow)
    const result = targetWasFound
      ? evaluateDropTarget(session.ids, targetId)
      : { valid: false, reason: '移到文件夹或根目录区域' }

    session.targetId = targetWasFound ? targetId : null
    session.targetValid = result.valid
    session.targetReason = result.reason
    setDropTargetId(targetWasFound ? (targetId ?? '__root__') : null)
    setDropTargetValid(result.valid)
    setDragPresentation({
      x: event.clientX,
      y: event.clientY,
      ids: session.ids,
      targetId: targetWasFound ? targetId : null,
      targetValid: result.valid,
      targetReason: result.reason,
    })
    updateHoverExpansion(targetWasFound ? targetId : null, result.valid)
  }, [evaluateDropTarget, updateHoverExpansion])

  const handleTreePointerUp = useCallback(async (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (session.dragging) {
      event.preventDefault()
      suppressNextClickRef.current = true
      const moveRequest = session.targetValid
        ? { ids: [...session.ids], targetId: session.targetId, reason: session.targetReason }
        : null
      resetPointerDrag()
      if (moveRequest) {
        const moved = await onBatchMoveFiles(moveRequest.ids, moveRequest.targetId)
        if (moved) {
          setSelectedIds(new Set())
          message.success(moveRequest.reason)
        }
      }
      return
    }
    resetPointerDrag()
  }, [onBatchMoveFiles, resetPointerDrag])

  const handleTreePointerCancel = useCallback(() => {
    if (dragSessionRef.current?.dragging) suppressNextClickRef.current = true
    resetPointerDrag()
  }, [resetPointerDrag])

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dragSessionRef.current) return
      event.preventDefault()
      handleTreePointerCancel()
    }
    window.addEventListener('keydown', cancelOnEscape, true)
    window.addEventListener('blur', handleTreePointerCancel)
    return () => {
      window.removeEventListener('keydown', cancelOnEscape, true)
      window.removeEventListener('blur', handleTreePointerCancel)
      clearHoverExpandTimer()
    }
  }, [clearHoverExpandTimer, handleTreePointerCancel])

  // --- 导入 ---
  const handleImportClick = (type: 'files' | 'folder') => {
    const input = document.createElement('input')
    input.type = 'file'
    if (type === 'folder') {
      input.setAttribute('webkitdirectory', '')
    } else {
      input.accept = '.md,.txt,.markdown'
      input.multiple = true
    }
    input.onchange = (ev) => {
      const target = ev.target as HTMLInputElement
      if (!target.files?.length) return
      if (type === 'folder') onImportFolder(target.files)
      else onImportFiles(target.files)
    }
    input.click()
  }

  const sortMenuItems = [
    { key: 'name', label: '按名称' },
    { key: 'created', label: '按创建时间' },
    { key: 'updated', label: '按修改时间' },
  ]

  const importMenuItems = [
    { key: 'files', label: '导入文件' },
    { key: 'folder', label: '导入文件夹' },
  ]

  const multiMenuItems = [
    { key: 'copy', label: `复制 ${selectedIds.size} 项`, icon: <CopyOutlined /> },
    { key: 'delete', label: `删除 ${selectedIds.size} 项`, icon: <DeleteOutlined />, danger: true },
  ]

  return (
    <>
      <div className={styles.toolbar} data-testid="file-toolbar">
        <div className={styles.toolbarActions} data-testid="file-toolbar-actions">
          <button className={styles.toolBtn} title="新建笔记" aria-label="新建笔记" onClick={() => onCreateFile(null, 'file')}>
            <EditOutlined />
          </button>
          <button className={styles.toolBtn} title="新建文件夹" aria-label="新建文件夹" onClick={() => onCreateFile(null, 'folder')}>
            <FolderAddOutlined />
          </button>
          <Dropdown menu={{ items: importMenuItems, onClick: ({ key }) => handleImportClick(key as 'files' | 'folder') }} trigger={['click']}>
            <button className={styles.toolBtn} title="导入" aria-label="导入">
              <ImportOutlined />
            </button>
          </Dropdown>
          <Dropdown menu={{ items: sortMenuItems, onClick: ({ key }) => onSort(key as 'name' | 'created' | 'updated') }} trigger={['click']}>
            <button className={styles.toolBtn} title="排序" aria-label="排序">
              <SortAscendingOutlined />
            </button>
          </Dropdown>
          <button
            className={styles.toolBtn}
            title={allFoldersExpanded ? '全部折叠' : '全部展开'}
            aria-label={allFoldersExpanded ? '全部折叠' : '全部展开'}
            onClick={allFoldersExpanded ? onCollapseAll : onExpandAll}
          >
            {allFoldersExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
          </button>
        </div>
      </div>
      <div
        ref={treeRef}
        className={`${styles.fileTree} ${dragPresentation ? styles.dragSession : ''}`}
        data-testid="file-tree"
        onPointerDown={handleTreePointerDown}
        onPointerMove={handleTreePointerMove}
        onPointerUp={handleTreePointerUp}
        onPointerCancel={handleTreePointerCancel}
      >
        {dragPresentation && (
          <div
            className={`${styles.rootDropZone} ${dropTargetId === '__root__' ? (dropTargetValid ? styles.rootDropZoneActive : styles.rootDropZoneInvalid) : ''}`}
            data-root-drop-zone="true"
          >
            移到根目录
          </div>
        )}
        {rootNodes.map(node => (
          <FileTreeNode
            key={node.id}
            file={node}
            files={files}
            depth={0}
            expandedIds={expandedIds}
            activeFileId={activeFileId}
            selectedIds={selectedIds}
            renamingId={renamingId}
            renameValue={renameValue}
            draggedIds={draggedIds}
            dropTargetId={dropTargetId}
            dropTargetValid={dropTargetValid}
            onNodeClick={handleNodeClick}
            onToggleFolder={onToggleFolder}
            onDeleteFile={onDeleteFile}
            onCreateFile={onCreateFile}
            onStartRename={handleStartRename}
            onRenameChange={setRenameValue}
            onRenameConfirm={handleRenameConfirm}
            onRenameCancel={handleRenameCancel}
            onContextMenu={handleContextMenu}
            onRequestAgentPermission={onRequestAgentPermission}
          />
        ))}
      </div>

      {dragPresentation && (() => {
        const first = files.find(file => file.id === dragPresentation.ids[0])
        const left = Math.min(dragPresentation.x + 12, window.innerWidth - 292)
        const top = Math.min(dragPresentation.y + 12, window.innerHeight - 76)
        return (
          <div
            className={`${styles.dragOverlay} ${dragPresentation.targetValid ? '' : styles.dragOverlayInvalid}`}
            style={{ left: Math.max(8, left), top: Math.max(8, top) }}
            role="status"
            aria-live="polite"
            data-testid="file-drag-overlay"
          >
            <div className={styles.dragOverlayTitle}>
              <FileTextOutlined aria-hidden="true" />
              <span>{first?.name ?? '所选项目'}</span>
              {dragPresentation.ids.length > 1 && <strong>+{dragPresentation.ids.length - 1}</strong>}
            </div>
            <div className={styles.dragOverlayTarget}>{dragPresentation.targetReason}</div>
          </div>
        )
      })()}

      {/* 多选右键菜单 */}
      {multiMenuPosition && (
        <div
          className={styles.multiMenuOverlay}
          onClick={() => setMultiMenuPosition(null)}
          onContextMenu={(e) => { e.preventDefault(); setMultiMenuPosition(null) }}
        >
          <div
            className={styles.multiMenu}
            style={{ left: multiMenuPosition.x, top: multiMenuPosition.y }}
            onClick={e => e.stopPropagation()}
          >
            {multiMenuItems.map(item => (
              <div
                key={item.key}
                className={`${styles.multiMenuItem} ${item.danger ? styles.danger : ''}`}
                onClick={() => {
                  if (item.key === 'delete') handleMultiBatchDelete()
                  else if (item.key === 'copy') handleMultiCopy()
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** 侧栏容器 */
const Sidebar: React.FC<Props> = (props) => {
  const { activePanel, files, mentorId, onSelectFile, permissionRequest, onPermissionRequestHandled, onSetAgentPermissions } = props

  return (
    <div className={styles.sidebar} data-testid="path-sidebar">
      {activePanel === 'files' && <FileTreePanel {...props} />}
      {activePanel === 'mentor' && <MentorPanel mentorId={mentorId} />}
      {activePanel === 'search' && <SearchPanel files={files} onSelectFile={onSelectFile} />}
      <div className={styles.preservedPanel} hidden={activePanel !== 'permissions'}>
        <PermissionPanel
          files={files}
          request={permissionRequest}
          onRequestHandled={onPermissionRequestHandled}
          onSetPermissions={onSetAgentPermissions}
        />
      </div>
      <div className={styles.preservedPanel} hidden={activePanel !== 'markdown-guide'}>
        <MarkdownGuidePanel />
      </div>
    </div>
  )
}

export default Sidebar
