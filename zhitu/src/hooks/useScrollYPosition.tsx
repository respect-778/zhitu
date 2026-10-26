// hooks/useScrollPosition.ts
// 获取当前 y 轴滚动距离
import { throttle } from 'lodash'
import { useState, useEffect, useRef } from 'react'

export const useScrollYPosition = () => {
  const [scrollYPosition, setScrollYPosition] = useState(0)
  const scrollRef = useRef(throttle(() => { // 只创建一次：useRef 的初始值只在组件首次渲染时创建，后续重渲染不会重新执行 throttle()
    setScrollYPosition(window.pageYOffset)
  }, 300))

  useEffect(() => {
    // 使用 useRef是为了防止，当该 hook 后续有重渲染的时候，会重新创建新的 updatePosition 函数（throttle 会返回一个新函数），导致后续组件卸载的时候，无法删除事件监听
    const updatePosition = scrollRef.current // 这是 throttle 产生的 节流函数 

    window.addEventListener('scroll', updatePosition, { passive: true }) // 将滚动事件绑定到 window 上，优化 -> 节流

    return () => window.removeEventListener('scroll', updatePosition)
    // useEffect hook里的 return 执行时机：
    // 1. 如果没有依赖性，在组件卸载的时候，所以这里相当于组件卸载的时候才会删除滚动事件
    // 2. 如果有依赖性，会先执行 return，然后再执行一次 effect
  }, [])

  return {
    scrollYPosition
  }
}