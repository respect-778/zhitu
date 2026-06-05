import type React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { BookOutlined, CloseOutlined } from '@ant-design/icons'
import { HIGHLIGHT_COLORS } from '@/types/highlight'
import { getSelectionContext } from '@/utils/highlightRenderer'
import styles from './index.module.less'

interface SelectionContext {
  text: string
  textBefore: string
  textAfter: string
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
  onHighlight: (color: string, ctx: SelectionContext) => void
  onCite: (ctx: SelectionContext) => void
}

const SelectionToolbar: React.FC<Props> = ({ containerRef, onHighlight, onCite }) => {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const toolbarRef = useRef<HTMLDivElement>(null)
  // 弹出工具条时就缓存选区，避免点击按钮后 selection 被清除
  const cachedCtxRef = useRef<SelectionContext | null>(null)

  const hide = useCallback(() => {
    setVisible(false)
    cachedCtxRef.current = null
  }, [])

  // 延迟检查 selection，避免和其他组件的 mousedown 事件冲突
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return

      setTimeout(() => {
        const container = containerRef.current
        if (!container) return

        const markdownBody = container.querySelector('.markdown-body') as HTMLElement | null
        if (!markdownBody) return

        const ctx = getSelectionContext(markdownBody)
        if (!ctx) {
          setVisible(false)
          cachedCtxRef.current = null
          return
        }

        const sel = window.getSelection()!
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        const toolbarWidth = 280
        let x = rect.left + rect.width / 2 - toolbarWidth / 2
        x = Math.max(8, Math.min(x, window.innerWidth - toolbarWidth - 8))
        const y = rect.top - 48

        cachedCtxRef.current = ctx
        setPos({ x, y: Math.max(8, y) })
        setVisible(true)
      }, 0)
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [containerRef])

  useEffect(() => {
    if (!visible) return
    const onScroll = () => hide()
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [visible, hide])

  const handleColorClick = (color: string) => {
    const ctx = cachedCtxRef.current
    if (!ctx) return
    onHighlight(color, ctx)
  }

  const handleCiteClick = () => {
    const ctx = cachedCtxRef.current
    if (!ctx) return
    onCite(ctx)
    hide()
    window.getSelection()?.removeAllRanges()
  }

  // 阻止按钮 mousedown 清除 selection
  const preventSelection = (e: React.MouseEvent) => e.preventDefault()

  if (!visible) return null

  return createPortal(
    <div ref={toolbarRef} className={styles.toolbar} style={{ left: pos.x, top: pos.y }}>
      <div className={styles.colors}>
        {HIGHLIGHT_COLORS.map(color => (
          <button
            key={color}
            className={styles.colorDot}
            style={{ backgroundColor: color }}
            onMouseDown={preventSelection}
            onClick={() => handleColorClick(color)}
          />
        ))}
      </div>
      <div className={styles.divider} />
      <button className={styles.citeBtn} onMouseDown={preventSelection} onClick={handleCiteClick}>
        <BookOutlined />
        <span>添加引用</span>
      </button>
      <button className={styles.closeBtn} onClick={hide}>
        <CloseOutlined />
      </button>
    </div>,
    document.body
  )
}

export default SelectionToolbar
