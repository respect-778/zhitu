// 左侧侧边栏
export interface INavItems {
  id: string
  label: string
  icon?: React.ReactNode
}

// 左侧热门关键词
export interface IHotkeyword {
  id: number,
  name: string
}

// 帖子类型
export interface IContent {
  id: string
  avatar: string
  name: string
  time: string
  content: string
  likes: number
  comments: number
  collection: number
  photo?: string[]
  video?: string[]
  link?: string[]
}

// 搜索参数
export interface IContentSearchParams {
  name?: string
  content?: string
}

// 分页参数
export interface IContentPageParams {
  pageNum: number
  pageSize: number
  total: number
}