import type React from 'react'
import { useState, useCallback } from 'react'
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
} from '@ant-design/icons'
import { Dropdown, Input } from 'antd'
import type { VFile, SidebarPanel } from '@/types/growth'
import PlanPanel from './panels/PlanPanel'
import MentorPanel from './panels/MentorPanel'
import SearchPanel from './panels/SearchPanel'
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
  onImportFiles: (files: FileList) => void
  onImportFolder: (files: FileList) => void
  onCollapseAll: () => void
  onSort: (by: 'name' | 'created' | 'updated') => void
}

/** 将扁平文件数组构建为树形结构（文件夹排在文件前面） */
function buildTree(files: VFile[], parentId: string | null): VFile[] {
  return files
    .filter(f => f.parentId === parentId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.order - b.order
    })
}

/** 文件树节点 — 递归渲染，支持右键菜单（重命名/删除/新建）和行内重命名 */
const FileTreeNode: React.FC<{
  file: VFile
  files: VFile[]
  depth: number
  expandedIds: string[]
  activeFileId: string | null
  renamingId: string | null
  renameValue: string
  onToggleFolder: (id: string) => void
  onSelectFile: (id: string) => void
  onDeleteFile: (id: string) => void
  onCreateFile: (parentId: string | null, type: 'file' | 'folder') => void
  onStartRename: (id: string, currentName: string) => void
  onRenameChange: (value: string) => void
  onRenameConfirm: () => void
  onRenameCancel: () => void
}> = ({ file, files, depth, expandedIds, activeFileId, renamingId, renameValue, onToggleFolder, onSelectFile, onDeleteFile, onCreateFile, onStartRename, onRenameChange, onRenameConfirm, onRenameCancel }) => {
  const isFolder = file.type === 'folder'
  const isExpanded = expandedIds.includes(file.id)
  const isActive = file.id === activeFileId
  const isRenaming = file.id === renamingId
  const children = isFolder ? buildTree(files, file.id) : []

  const handleClick = () => {
    if (isFolder) onToggleFolder(file.id)
    else onSelectFile(file.id)
  }

  const menuItems = [
    ...(isFolder ? [
      { key: 'newFile', label: '新建笔记', icon: <EditOutlined /> },
      { key: 'newFolder', label: '新建文件夹', icon: <FolderAddOutlined /> },
      { type: 'divider' as const },
    ] : []),
    { key: 'rename', label: '重命名', icon: <FormOutlined /> },
    { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'rename') onStartRename(file.id, file.name)
    else if (key === 'delete') onDeleteFile(file.id)
    else if (key === 'newFile') onCreateFile(file.id, 'file')
    else if (key === 'newFolder') onCreateFile(file.id, 'folder')
  }

  return (
    <>
      <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['contextMenu']}>
        <div
          className={`${styles.treeNode} ${isActive ? styles.active : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={handleClick}
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
                renamingId={renamingId}
                renameValue={renameValue}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                onDeleteFile={onDeleteFile}
                onCreateFile={onCreateFile}
                onStartRename={onStartRename}
                onRenameChange={onRenameChange}
                onRenameConfirm={onRenameConfirm}
                onRenameCancel={onRenameCancel}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** 文件面板 — 包含工具栏（新建/导入/排序/折叠）和文件树 */
const FileTreePanel: React.FC<Omit<Props, 'activePanel' | 'mentorId'>> = ({
  files, expandedIds, activeFileId,
  onToggleFolder, onSelectFile, onCreateFile, onDeleteFile, onRenameFile,
  onImportFiles, onImportFolder, onCollapseAll, onSort,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const rootNodes = buildTree(files, null)

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

  const handleImportClick = (type: 'files' | 'folder') => {
    const input = document.createElement('input')
    input.type = 'file'
    if (type === 'folder') {
      input.setAttribute('webkitdirectory', '')
    } else {
      input.accept = '.md,.txt,.markdown'
      input.multiple = true
    }
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement
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
      <div className={styles.fileTree}>
        {rootNodes.map(node => (
          <FileTreeNode
            key={node.id}
            file={node}
            files={files}
            depth={0}
            expandedIds={expandedIds}
            activeFileId={activeFileId}
            renamingId={renamingId}
            renameValue={renameValue}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
            onDeleteFile={onDeleteFile}
            onCreateFile={onCreateFile}
            onStartRename={handleStartRename}
            onRenameChange={setRenameValue}
            onRenameConfirm={handleRenameConfirm}
            onRenameCancel={handleRenameCancel}
          />
        ))}
      </div>
    </>
  )
}

/** 侧栏容器 — 根据 activePanel 切换显示：文件树/计划/导师/搜索 */
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
