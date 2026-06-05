import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  EditOutlined,
  FolderAddOutlined,
  SortAscendingOutlined,
  MinusSquareOutlined,
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
import type { VFile, SidebarPanel } from '@/types/path'
import PlanPanel from './panels/PlanPanel/PlanPanel'
import MentorPanel from './panels/MentorPanel/MentorPanel'
import SearchPanel from './panels/SearchPanel/SearchPanel'
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
  onMoveFile: (id: string, newParentId: string | null) => void
  onBatchDeleteFiles: (ids: string[]) => void
  onBatchCreateFiles: (items: Array<{
    id: string; name: string; type: 'file' | 'folder';
    parentId: string | null; content?: string; fileType?: VFile['fileType']; order: number;
  }>) => void
  onImportFiles: (files: FileList) => void
  onImportFolder: (files: FileList) => void
  onCollapseAll: () => void
  onSort: (by: 'name' | 'created' | 'updated') => void
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
  onNodeClick: (id: string, e: React.MouseEvent) => void
  onToggleFolder: (id: string) => void
  onDeleteFile: (id: string) => void
  onCreateFile: (parentId: string | null, type: 'file' | 'folder') => void
  onStartRename: (id: string, currentName: string) => void
  onRenameChange: (value: string) => void
  onRenameConfirm: () => void
  onRenameCancel: () => void
  onContextMenu: (id: string, e: React.MouseEvent) => void
  onDragStart: (id: string, e: React.DragEvent) => void
  onDragOver: (id: string, e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (id: string, e: React.DragEvent) => void
  onDragEnd: () => void
}> = ({ file, files, depth, expandedIds, activeFileId, selectedIds, renamingId, renameValue, draggedIds, dropTargetId, onNodeClick, onToggleFolder, onDeleteFile, onCreateFile, onStartRename, onRenameChange, onRenameConfirm, onRenameCancel, onContextMenu, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) => {
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
  }

  const nodeClassName = [
    styles.treeNode,
    isActive ? styles.active : '',
    isSelected ? styles.selected : '',
    isDragging ? styles.dragging : '',
    isDropTarget ? styles.dropTarget : '',
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
          onClick={(e) => onNodeClick(file.id, e)}
          onContextMenu={(e) => onContextMenu(file.id, e)}
          draggable={!isRenaming}
          onDragStart={(e) => onDragStart(file.id, e)}
          onDragOver={(e) => onDragOver(file.id, e)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(file.id, e)}
          onDragEnd={onDragEnd}
        >
          {isFolder ? (
            <span className={`${styles.arrow} ${isExpanded ? styles.arrowExpanded : ''}`}>
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
                onNodeClick={onNodeClick}
                onToggleFolder={onToggleFolder}
                onDeleteFile={onDeleteFile}
                onCreateFile={onCreateFile}
                onStartRename={onStartRename}
                onRenameChange={onRenameChange}
                onRenameConfirm={onRenameConfirm}
                onRenameCancel={onRenameCancel}
                onContextMenu={onContextMenu}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
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
  onMoveFile, onBatchDeleteFiles, onBatchCreateFiles,
  onImportFiles, onImportFolder, onCollapseAll, onSort,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [draggedIds, setDraggedIds] = useState<Set<string>>(new Set())
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const contextMenuRef = useRef<{ x: number; y: number } | null>(null)
  const [multiMenuOpen, setMultiMenuOpen] = useState(false)

  const rootNodes = buildTree(files, null)

  const flatList = useMemo(
    () => flattenVisibleTree(files, expandedIds),
    [files, expandedIds]
  )

  // --- 点击逻辑（多选） ---
  const handleNodeClick = useCallback((id: string, e: React.MouseEvent) => {
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
      contextMenuRef.current = { x: e.clientX, y: e.clientY }
      setMultiMenuOpen(true)
    }
  }, [selectedIds])

  const handleMultiBatchDelete = useCallback(() => {
    setMultiMenuOpen(false)
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
    setMultiMenuOpen(false)
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

  // --- 拖拽 ---
  const handleDragStart = useCallback((id: string, e: React.DragEvent) => {
    const ids = selectedIds.has(id) && selectedIds.size > 1
      ? new Set(selectedIds)
      : new Set([id])
    setDraggedIds(ids)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', Array.from(ids).join(','))
    if (ids.size > 1) {
      const badge = document.createElement('div')
      badge.textContent = `${ids.size} 项`
      badge.style.cssText = 'padding:4px 12px;background:var(--primary-color, #1677ff);color:#fff;border-radius:4px;font-size:12px;position:absolute;top:-9999px'
      document.body.appendChild(badge)
      e.dataTransfer.setDragImage(badge, 0, 0)
      requestAnimationFrame(() => badge.remove())
    }
  }, [selectedIds])

  const handleDragOver = useCallback((id: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const target = files.find(f => f.id === id)
    if (!target || target.type !== 'folder' || draggedIds.has(id)) return
    const anyInvalid = Array.from(draggedIds).some(did => id === did || isDescendant(files, id, did))
    if (!anyInvalid) setDropTargetId(id)
  }, [files, draggedIds])

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null)
  }, [])

  const handleDrop = useCallback((targetId: string, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedIds.size === 0) return
    const targetFile = files.find(f => f.id === targetId)
    if (targetFile?.type !== 'folder') return
    // 不能拖给自己，也不能拖入自身后代
    if (draggedIds.has(targetId)) return
    const anyInvalid = Array.from(draggedIds).some(did => isDescendant(files, targetId, did))
    if (anyInvalid) return
    // 跳过已在目标文件夹内的项（避免无意义移动）
    const toMove = Array.from(draggedIds).filter(id => {
      const f = files.find(file => file.id === id)
      return f && f.parentId !== targetId
    })
    if (toMove.length === 0) return
    toMove.forEach(id => onMoveFile(id, targetId))
    setDraggedIds(new Set())
    setDropTargetId(null)
    setSelectedIds(new Set())
    message.success(`已移动到「${targetFile.name}」`)
  }, [draggedIds, files, onMoveFile])

  const handleDragEnd = useCallback(() => {
    setDraggedIds(new Set())
    setDropTargetId(null)
  }, [])

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIds.size > 0) setDropTargetId('__root__')
  }, [draggedIds])

  const handleRootDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIds.size === 0) return
    const toMove = Array.from(draggedIds).filter(id => {
      const f = files.find(file => file.id === id)
      return f && f.parentId !== null
    })
    if (toMove.length === 0) {
      setDraggedIds(new Set())
      setDropTargetId(null)
      return
    }
    toMove.forEach(id => onMoveFile(id, null))
    setDraggedIds(new Set())
    setDropTargetId(null)
    setSelectedIds(new Set())
    message.success('已移动到根目录')
  }, [draggedIds, files, onMoveFile])

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
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} title="新建笔记" onClick={() => onCreateFile(null, 'file')}>
          <EditOutlined />
        </button>
        <button className={styles.toolBtn} title="新建文件夹" onClick={() => onCreateFile(null, 'folder')}>
          <FolderAddOutlined />
        </button>
        <Dropdown menu={{ items: importMenuItems, onClick: ({ key }) => handleImportClick(key as 'files' | 'folder') }} trigger={['click']}>
          <button className={styles.toolBtn} title="导入">
            <ImportOutlined />
          </button>
        </Dropdown>
        <Dropdown menu={{ items: sortMenuItems, onClick: ({ key }) => onSort(key as 'name' | 'created' | 'updated') }} trigger={['click']}>
          <button className={styles.toolBtn} title="排序">
            <SortAscendingOutlined />
          </button>
        </Dropdown>
        <button className={styles.toolBtn} title="折叠全部" onClick={onCollapseAll}>
          <MinusSquareOutlined />
        </button>
      </div>
      <div
        className={`${styles.fileTree} ${dropTargetId === '__root__' ? styles.dropTargetRoot : ''}`}
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
        onDragLeave={() => { if (dropTargetId === '__root__') setDropTargetId(null) }}
      >
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
            onNodeClick={handleNodeClick}
            onToggleFolder={onToggleFolder}
            onDeleteFile={onDeleteFile}
            onCreateFile={onCreateFile}
            onStartRename={handleStartRename}
            onRenameChange={setRenameValue}
            onRenameConfirm={handleRenameConfirm}
            onRenameCancel={handleRenameCancel}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* 多选右键菜单 */}
      {multiMenuOpen && contextMenuRef.current && (
        <div
          className={styles.multiMenuOverlay}
          onClick={() => setMultiMenuOpen(false)}
          onContextMenu={(e) => { e.preventDefault(); setMultiMenuOpen(false) }}
        >
          <div
            className={styles.multiMenu}
            style={{ left: contextMenuRef.current.x, top: contextMenuRef.current.y }}
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
  const { activePanel, files, mentorId, onSelectFile } = props

  return (
    <div className={styles.sidebar}>
      {activePanel === 'files' && <FileTreePanel {...props} />}
      {activePanel === 'plan' && <PlanPanel />}
      {activePanel === 'mentor' && <MentorPanel mentorId={mentorId} />}
      {activePanel === 'search' && <SearchPanel files={files} onSelectFile={onSelectFile} />}
    </div>
  )
}

export default Sidebar
