import { useRef, useState, useCallback, useEffect } from 'react'

function useCarouselControls(dependencyKey: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 2)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    checkScroll()
    const timer = window.setTimeout(checkScroll, 0)
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)

    return () => {
      window.clearTimeout(timer)
      ro.disconnect()
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, dependencyKey])

  const scrollBy = useCallback((dir: number) => {
    ref.current?.scrollBy({ left: dir * 460, behavior: 'smooth' })
  }, [])

  return { ref, canScrollLeft, canScrollRight, scrollBy }
}

export default useCarouselControls
