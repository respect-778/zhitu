// hooks/useAutoResizeTextarea.ts
// textarea 自适应高度 hook
import { useCallback, useLayoutEffect, useRef } from 'react'

type Options = {
  value: string
  minHeight: number // px
  maxHeight: number // px
}

export function useAutoResizeTextarea({
  value,
  minHeight,
  maxHeight,
}: Options) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    el.style.height = 'auto' // 先重置，再按内容算
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight) // textarea 最大高度和最小高度的边界处理
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden' // 超出部分设置滚轮
  }, [minHeight, maxHeight])

  useLayoutEffect(() => {
    resize()
  }, [value, resize])

  return { textareaRef, resize }
}
