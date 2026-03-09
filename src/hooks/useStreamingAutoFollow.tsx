// hook 作用：给聊天流式回复提供“自动贴底 + 用户可打断”的滚动控制
import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"

export interface UseStreamingAutoFollowOptions {
  isStreaming: boolean
  depKey: string | number
  bottomThreshold?: number
}

export interface UseStreamingAutoFollowReturn {
  containerRef: RefObject<HTMLDivElement | null>
  endRef: RefObject<HTMLDivElement | null>
  autoFollow: boolean
  showJumpToBottom: boolean
  onUserScroll: () => void
  scrollToBottomAndLock: () => void
}

const isNearBottom = (el: HTMLElement, threshold = 24): boolean => {
  return Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= threshold
}

export const useStreamingAutoFollow = ({
  isStreaming,
  depKey,
  bottomThreshold = 24,
}: UseStreamingAutoFollowOptions): UseStreamingAutoFollowReturn => {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)
  const unlockProgrammaticRefId = useRef<number | null>(null)
  const autoFollowRef = useRef(true)
  const detachedByUserRef = useRef(false)
  const isProgrammaticScrollingRef = useRef(false)
  const [autoFollow, setAutoFollow] = useState(true)

  const updateAutoFollow = useCallback((next: boolean) => {
    if (autoFollowRef.current === next) return
    autoFollowRef.current = next
    setAutoFollow(next)
  }, [])

  const scheduleScrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      isProgrammaticScrollingRef.current = true
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" })
      if (unlockProgrammaticRefId.current !== null) {
        cancelAnimationFrame(unlockProgrammaticRefId.current)
      }
      unlockProgrammaticRefId.current = requestAnimationFrame(() => {
        isProgrammaticScrollingRef.current = false
        unlockProgrammaticRefId.current = null
      })
      rafIdRef.current = null
    })
  }, [])

  const scrollToBottomAndLock = useCallback(() => {
    detachedByUserRef.current = false
    updateAutoFollow(true)
    scheduleScrollToBottom()
  }, [scheduleScrollToBottom, updateAutoFollow])

  const onUserScroll = useCallback(() => {
    if (isProgrammaticScrollingRef.current) return

    const el = containerRef.current
    if (!el) return

    const nearBottom = isNearBottom(el, bottomThreshold)
    detachedByUserRef.current = !nearBottom
    updateAutoFollow(nearBottom)
  }, [bottomThreshold, updateAutoFollow])

  useEffect(() => {
    if (!isStreaming || !autoFollowRef.current) return
    scheduleScrollToBottom()
  }, [depKey, isStreaming, scheduleScrollToBottom])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const resizeObserver = new ResizeObserver(() => {
      if (!isStreaming || !autoFollowRef.current) return
      scheduleScrollToBottom()
    })

    resizeObserver.observe(el)

    return () => {
      resizeObserver.disconnect()
    }
  }, [isStreaming, scheduleScrollToBottom])

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      if (unlockProgrammaticRefId.current !== null) {
        cancelAnimationFrame(unlockProgrammaticRefId.current)
      }
    }
  }, [])

  return {
    containerRef,
    endRef,
    autoFollow,
    showJumpToBottom: isStreaming && !autoFollow,
    onUserScroll,
    scrollToBottomAndLock,
  }
}
