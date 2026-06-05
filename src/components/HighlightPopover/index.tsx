import type React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { EditOutlined, DeleteOutlined, CloseOutlined, CheckOutlined, BookOutlined } from '@ant-design/icons'
import { HIGHLIGHT_COLORS } from '@/types/highlight'
import type { Highlight } from '@/types/highlight'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'

interface Props {
  highlight: Highlight | null
  anchorRect: DOMRect | null
  onClose: () => void
  onEdit: (id: string, updates: { color?: string; note?: string }) => void
  onDelete: (id: string) => void
  onCite: (text: string) => void
}

const HighlightPopover: React.FC<Props> = ({ highlight, anchorRect, onClose, onEdit, onDelete, onCite }) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editColor, setEditColor] = useState('')
  const [editNote, setEditNote] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlight) {
      setMode('view')
      setEditColor(highlight.color)
      setEditNote(highlight.note || '')
    }
  }, [highlight])

  useEffect(() => {
    if (!highlight) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [highlight, onClose])

  const handleSave = useCallback(() => {
    if (!highlight) return
    onEdit(highlight.id, { color: editColor, note: editNote })
  }, [highlight, editColor, editNote, onEdit])

  const handleDelete = useCallback(() => {
    if (!highlight) return
    onDelete(highlight.id)
  }, [highlight, onDelete])

  if (!highlight || !anchorRect) return null

  const popoverWidth = 320
  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2
  left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8))
  let top = anchorRect.bottom + 8
  if (top + 300 > window.innerHeight) {
    top = anchorRect.top - 300 - 8
  }
  top = Math.max(8, top)

  return createPortal(
    <div ref={popoverRef} className={styles.popover} style={{ left, top }}>
      {mode === 'view' ? (
        <>
          <div className={styles.header}>
            <span className={styles.title}>划线详情</span>
            <button className={styles.closeBtn} onClick={onClose}><CloseOutlined /></button>
          </div>
          <div className={styles.quoteBlock}>
            <p className={styles.quoteText}>{highlight.text}</p>
          </div>
          {highlight.note && (
            <p className={styles.noteText}>{highlight.note}</p>
          )}
          <div className={styles.timestamp}>{formatDateTime(highlight.createdAt)}</div>
          <div className={styles.actions}>
            <button className={styles.editBtn} onClick={() => onCite(highlight.text)}>
              <BookOutlined /> 引用
            </button>
            <button className={styles.editBtn} onClick={() => setMode('edit')}>
              <EditOutlined /> 编辑
            </button>
            <button className={styles.deleteBtn} onClick={handleDelete}>
              <DeleteOutlined /> 删除
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.header}>
            <span className={styles.title}>编辑划线</span>
            <button className={styles.closeBtn} onClick={onClose}><CloseOutlined /></button>
          </div>
          <div className={styles.quoteBlock}>
            <p className={styles.quoteText}>{highlight.text}</p>
          </div>
          <div className={styles.colorRow}>
            <span className={styles.colorLabel}>颜色：</span>
            {HIGHLIGHT_COLORS.map(color => (
              <button
                key={color}
                className={`${styles.colorDot} ${editColor === color ? styles.colorDotActive : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setEditColor(color)}
              />
            ))}
          </div>
          <textarea
            className={styles.noteInput}
            placeholder="写下你的想法..."
            value={editNote}
            onChange={e => setEditNote(e.target.value)}
            rows={3}
          />
          <div className={styles.editActions}>
            <button className={styles.cancelBtn} onClick={() => setMode('view')}>取消</button>
            <button className={styles.saveBtn} onClick={handleSave}>
              <CheckOutlined /> 保存
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  )
}

export default HighlightPopover
