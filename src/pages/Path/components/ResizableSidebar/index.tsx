import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import styles from './index.module.less'

const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 560
const MIN_MAIN_WIDTH = 420
const SEPARATOR_WIDTH = 6
const COLLAPSE_THRESHOLD = 60
export const DEFAULT_SIDEBAR_WIDTH = 300

interface Props {
  visible: boolean
  onVisibilityChange: (visible: boolean) => void
  onWidthChange?: (width: number) => void
  children: React.ReactNode
}

const ResizableSidebar: React.FC<Props> = ({ visible, onVisibilityChange, onWidthChange, children }) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [maxWidth, setMaxWidth] = useState(MAX_SIDEBAR_WIDTH)
  const [dragging, setDragging] = useState(false)
  const panelWidth = visible ? Math.min(width, maxWidth) : 0

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !onWidthChange) return
    // Report the rendered width throughout the transition so the tab row follows it.
    const observer = new ResizeObserver(([entry]) => onWidthChange(entry.contentRect.width))
    observer.observe(panel)
    onWidthChange(panel.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [onWidthChange])

  useEffect(() => {
    const panel = panelRef.current
    const workspace = panel?.parentElement
    if (!panel || !workspace) return

    const measure = () => {
      const leftOffset = panel.getBoundingClientRect().left - workspace.getBoundingClientRect().left
      const nextMax = Math.max(0, Math.min(MAX_SIDEBAR_WIDTH, workspace.clientWidth - leftOffset - SEPARATOR_WIDTH - MIN_MAIN_WIDTH))
      setMaxWidth(nextMax)
      if (nextMax === 0) onVisibilityChange(false)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [onVisibilityChange])

  useEffect(() => {
    if (!dragging) return
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = cursor
      document.body.style.userSelect = userSelect
    }
  }, [dragging])

  const resize = (nextWidth: number) => {
    if (nextWidth <= COLLAPSE_THRESHOLD || maxWidth === 0) {
      onVisibilityChange(false)
      return
    }
    setWidth(Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)))
    onVisibilityChange(true)
  }

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <>
      <div ref={panelRef} id="path-sidebar-panel" className={`${styles.panel} ${dragging ? styles.dragging : ''}`} style={{ width: visible ? width : 0, maxWidth }} data-testid="path-sidebar-wrap" inert={!visible}>
        {children}
      </div>
      <div
        className={`${styles.separator} ${dragging ? styles.dragging : ''}`}
        data-collapsed={!visible}
        role="separator"
        tabIndex={0}
        aria-label="调整侧栏宽度"
        aria-orientation="vertical"
        aria-controls="path-sidebar-panel"
        aria-valuemin={0}
        aria-valuemax={maxWidth}
        aria-valuenow={panelWidth}
        onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          const renderedWidth = panelRef.current?.getBoundingClientRect().width ?? panelWidth
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: renderedWidth }
          if (renderedWidth > COLLAPSE_THRESHOLD) {
            setWidth(renderedWidth)
            onVisibilityChange(true)
          }
          setDragging(true)
        }}
        onPointerMove={event => {
          const drag = dragRef.current
          if (drag?.pointerId === event.pointerId) resize(drag.startWidth + event.clientX - drag.startX)
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          if (event.key === 'Home') resize(0)
          else if (event.key === 'End') resize(maxWidth)
          else if (event.key === 'ArrowRight') resize(visible ? panelWidth + 24 : width)
          else resize(panelWidth <= MIN_SIDEBAR_WIDTH ? 0 : panelWidth - 24)
        }}
      />
    </>
  )
}

export default ResizableSidebar
