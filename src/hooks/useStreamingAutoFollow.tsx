// hook 作用：给聊天流式回复提供“自动贴底 + 用户可打断”的滚动控制
import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"

export interface UseStreamingAutoFollowOptions {
  /** 当前是否处于流式回复中；只有流式阶段才需要持续自动贴底 */
  isStreaming: boolean
  /** 用来触发重新贴底的依赖 key，通常传消息长度、最后一条消息 id 或内容版本号 */
  depKey: string | number
  /** 距离底部多少像素内算“仍在底部”，给滚轮/触控板留一点误差空间 */
  bottomThreshold?: number
}

export interface UseStreamingAutoFollowReturn {
  /** 绑定到可滚动聊天容器上 */
  containerRef: RefObject<HTMLDivElement | null>
  /** 预留的底部锚点 ref，调用方如需 scrollIntoView 可以复用 */
  endRef: RefObject<HTMLDivElement | null>
  /** 当前是否处于自动跟随底部模式 */
  autoFollow: boolean
  /** 用户上滑打断自动跟随后，用于控制“回到底部”按钮展示 */
  showJumpToBottom: boolean
  /** 绑定到滚动容器的 onScroll，用来判断用户是否主动离开底部 */
  onUserScroll: () => void
  /** 用户点击“回到底部”时调用：回到底部并重新锁定自动跟随 */
  scrollToBottomAndLock: () => void
}

// 判断滚动条是否已经接近底部。使用阈值而不是严格等于，避免小数像素和惯性滚动导致误判。
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

  // 两个 raf 分别负责“下一帧执行滚动”和“再下一帧解除程序滚动标记”。
  const rafIdRef = useRef<number | null>(null)
  const unlockProgrammaticRefId = useRef<number | null>(null)

  // autoFollowRef 给异步回调读取最新值，state 则负责触发 UI 刷新。
  const autoFollowRef = useRef(true)
  // 记录用户是否主动上滑离开底部，避免流式内容继续强行把用户拉回去。
  const detachedByUserRef = useRef(false)
  // 区分代码触发的 scrollTo 和用户真实滚动，防止 onScroll 把程序滚动误判成用户打断。
  const isProgrammaticScrollingRef = useRef(false)
  const [autoFollow, setAutoFollow] = useState(true)

  // 同步更新 ref 和 state：ref 保证回调拿到最新值，state 保证按钮等 UI 响应变化。
  const updateAutoFollow = useCallback((next: boolean) => {
    if (autoFollowRef.current === next) return
    autoFollowRef.current = next
    setAutoFollow(next)
  }, [])

  // 把滚动动作推迟到下一帧，等 DOM 高度更新后再读取 scrollHeight，避免贴底位置落后一帧。
  const scheduleScrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    // 同一帧内多次内容更新时，只保留最后一次贴底任务。
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      isProgrammaticScrollingRef.current = true
      // 流式输出时要立即贴底，避免 smooth 动画堆积造成滚动迟滞。
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" })
      if (unlockProgrammaticRefId.current !== null) {
        cancelAnimationFrame(unlockProgrammaticRefId.current)
      }
      // 程序滚动也会触发 onScroll，延后一帧再解锁，确保这次 onScroll 被忽略。
      unlockProgrammaticRefId.current = requestAnimationFrame(() => {
        isProgrammaticScrollingRef.current = false
        unlockProgrammaticRefId.current = null
      })
      rafIdRef.current = null
    })
  }, [])

  // 手动回到底部后，重新进入自动跟随模式。
  const scrollToBottomAndLock = useCallback(() => {
    detachedByUserRef.current = false
    updateAutoFollow(true)
    scheduleScrollToBottom()
  }, [scheduleScrollToBottom, updateAutoFollow])

  // 用户滚动时，如果离开底部就暂停自动跟随；重新滚回底部则恢复。
  const onUserScroll = useCallback(() => {
    if (isProgrammaticScrollingRef.current) return

    const el = containerRef.current
    if (!el) return

    const nearBottom = isNearBottom(el, bottomThreshold)
    detachedByUserRef.current = !nearBottom
    updateAutoFollow(nearBottom)
  }, [bottomThreshold, updateAutoFollow])

  // 流式内容变化时，如果仍处于自动跟随模式，就持续贴底。
  useEffect(() => {
    if (!isStreaming || !autoFollowRef.current) return
    scheduleScrollToBottom()
  }, [depKey, isStreaming, scheduleScrollToBottom])

  // 容器尺寸变化也可能改变底部位置，例如图片加载、代码块展开或窗口尺寸变化。
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

  // 卸载时清理尚未执行的 raf，避免组件卸载后继续访问旧 DOM。
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
