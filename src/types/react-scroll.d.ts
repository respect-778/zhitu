declare module 'react-scroll' {
  import type { ComponentType, MouseEventHandler, ReactNode } from 'react'

  export type ScrollSmooth = boolean | 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'

  export interface LinkProps {
    to: string
    activeClass?: string
    className?: string
    spy?: boolean
    smooth?: ScrollSmooth
    isDynamic?: boolean
    offset?: number
    duration?: number
    delay?: number
    hashSpy?: boolean
    ignoreCancelEvents?: boolean
    onClick?: MouseEventHandler<HTMLElement>
    onSetActive?: (to: string) => void
    onSetInactive?: (to: string) => void
    children?: ReactNode
  }

  export interface ScrollerOptions {
    smooth?: ScrollSmooth
    offset?: number
    duration?: number
    delay?: number
    containerId?: string
    horizontal?: boolean
  }

  export const Link: ComponentType<LinkProps>
  export const scroller: {
    scrollTo: (to: string, options?: ScrollerOptions) => void
  }
}
