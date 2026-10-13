import type React from 'react'
import { Dropdown } from 'antd'
import { FileTextOutlined, LeftOutlined, RightOutlined, ShareAltOutlined, ReadOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'
import type { VFile } from '@/types/path'
import styles from './index.module.less'

interface Props {
  file: VFile | null
  files: VFile[]
  showGraph: boolean
  reading: boolean
  canGoBack: boolean
  canGoForward: boolean
  onNavBack: () => void
  onNavForward: () => void
  onToggleReading: () => void
  sourceMode: boolean
  canCancelFormat: boolean
  canInsertAfter: boolean
  onPrepareEditorActions: () => void
  onEditorAction: (action: string) => void
}

const DocumentToolbar: React.FC<Props> = ({ file, files, showGraph, reading, canGoBack, canGoForward, onNavBack, onNavForward, onToggleReading, sourceMode, canCancelFormat, canInsertAfter, onPrepareEditorActions, onEditorAction }) => {
  const names = file ? [file.name] : []
  const visited = new Set<string>()
  let parentId = file?.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = files.find(item => item.id === parentId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parentId
  }
  const path = showGraph ? '知识图谱' : names.join(' / ')

  return (
    <div className={styles.breadcrumb} data-testid="path-document-toolbar">
      <div className={styles.navButtons}>
        <button type="button" className={styles.navBtn} onClick={onNavBack} disabled={!canGoBack} aria-label="返回" title="返回"><LeftOutlined /></button>
        <button type="button" className={styles.navBtn} onClick={onNavForward} disabled={!canGoForward} aria-label="前进" title="前进"><RightOutlined /></button>
      </div>
      <div className={styles.breadcrumbPath} title={path}>
        {showGraph ? <ShareAltOutlined className={styles.breadcrumbIcon} /> : file && <FileTextOutlined className={styles.breadcrumbIcon} />}
        <span>{path}</span>
      </div>
      {!showGraph && file && !reading && (
        <Dropdown trigger={['click']} onOpenChange={open => { if (open) onPrepareEditorActions() }} menu={{
          items: [
            { key: 'cancel-format', label: '取消当前格式', disabled: !canCancelFormat },
            { key: 'insert-after', label: '在当前块后继续输入', disabled: !canInsertAfter },
            { type: 'divider' },
            { key: 'source', label: sourceMode ? '返回即时渲染' : '编辑 Markdown 源码' },
          ],
          onClick: ({ key }) => onEditorAction(key),
        }}>
          <button type="button" className={styles.modeButton} onMouseDown={event => event.preventDefault()} aria-label="编辑操作" title="编辑操作"><MoreOutlined /></button>
        </Dropdown>
      )}
      {!showGraph && file && (
        <button type="button" className={styles.modeButton} onClick={onToggleReading} aria-label={reading ? '切换到编辑模式' : '切换到阅读模式'} title={reading ? '切换到编辑模式' : '切换到阅读模式'}>
          {reading ? <EditOutlined /> : <ReadOutlined />}
        </button>
      )}
    </div>
  )
}

export default DocumentToolbar
