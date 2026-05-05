import type { ReactNode } from 'react'

export interface INavItems {
  id: string
  label: string
  icon?: ReactNode
}

export interface IHotkeyword {
  id: string
  name: string
}

export interface IContent {
  id?: number
  avatar: string
  name: string
  time: string
  title: string
  content: string
  cover?: string // 封面
  abstract: string // 摘要
  art_count?: number
  likes: number
  comments: number
  collection: number
  photo?: string[]
  video?: string[]
  link?: string[]
  isLiked: boolean
  isCollected: boolean
  Pageviews: number
}

export interface IContentDetail extends IContent {
  authorId: number
  fans_count: number
  isFollowed: boolean
}

export interface IContentSearchParams {
  name?: string
  content?: string
}

export interface IContentPageParams {
  list: []
  pageNum: number
  pageSize: number
  total: number
}
