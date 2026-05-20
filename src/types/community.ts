import type { ReactNode } from 'react'

export interface INavItems {
  id: string
  label: string
  icon?: ReactNode
}

export interface IPersonItem {
  id: string
  name: string
  icon?: ReactNode
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
  keywords?: string[] // 关键词
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

export interface IFolder {
  id: number
  name: string
  color: string
}

export interface IWeeklyItem {
  issueNumber: number
  postId: number
  title: string
  abstract: string
  author: string
  avatar: string
  date: string
  weekStart: string
  likes: number
  collection: number
  pageviews: number
}

export interface IFollowingUser {
  id: number
  username: string
  avatar: string
  art_count: number
  fans_count: number
}

export interface IUserProfile {
  id: number
  username: string
  avatar: string
  bio: string
  art_count: number
  fans_count: number
  follow_count: number
  like_count: number
  isFollowed: boolean
}

export interface IArticleItem {
  id: number
  post_id: number
  title?: string
  abstract?: string
  cover?: string
  username?: string
  avatar?: string
  last_read_at?: string
  created_at?: string
  read_count?: number
}