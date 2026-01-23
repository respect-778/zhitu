// hooks/useScrollPosition.ts
// 获取当前 y 轴滚动距离
import { throttle } from 'lodash'
import { useState, useEffect } from 'react'

export const useScrollYPosition = () => {
  const [scrollYPosition, setScrollYPosition] = useState(0)

  useEffect(() => {
    const updatePosition = () => {
      setScrollYPosition(window.pageYOffset)
    }

    window.addEventListener('scroll', throttle(updatePosition, 300), { passive: true }) // 将滚动事件绑定到 window 上，优化 -> 节流

    return () => window.removeEventListener('scroll', updatePosition)
    // useEffect hook里的 return 执行时机：
    // 1. 如果没有依赖性，在组件卸载的时候，所以这里相当于组件卸载的时候才会删除滚动事件
    // 2. 如果有依赖性，会先执行 return，然后再执行一次 effect
  }, [])

  return {
    scrollYPosition
  }
}