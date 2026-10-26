import type { IContent } from "@/types/community";
import httpInstance from "@/utils/http";

export interface UploadImageResponse {
  url?: string
  urls?: string[]
}


// 获取帖子列表
export const getCommunityListAPI = () => {
  return httpInstance({
    url: "/community/list",
    method: "get"
  })
}

// 精选周刊接口
export const getWeeklyDigestAPI = (params: { pageNum: number; pageSize: number; }) => {
  return httpInstance({
    url: "/community/weekly",
    method: "get",
    params
  })
}

// 热门接口
export const getHotCommunityListAPI = (params: { keyword?: string; pageNum: number; pageSize: number; }) => {
  return httpInstance({
    url: "/community/hot",
    method: "get",
    params
  })
}

// 最新接口
export const getNewCommunityListAPI = (params: { keyword?: string; pageNum: number; pageSize: number; }) => {
  return httpInstance({
    url: "/community/new",
    method: "get",
    params
  })
}

// 搜索/分页/推荐 接口
export const searchCommunityAPI = (params: { keyword?: string; pageNum: number; pageSize: number; }) => {
  return httpInstance({
    url: "/community/search",
    method: "get",
    params
  })
}

// 根据 id 获取文章数据
export const getCommunityByIdAPI = (id: number) => {
  return httpInstance({
    url: `/community/${id}`,
    method: 'get'
  })
}

// 上传图片接口，后端返回正确的图片格式（以后端 url 拼接而成的图片）
export const uploadImageAPI = (formData: FormData) => {
  return httpInstance<UploadImageResponse>({
    url: "/community/image",
    method: "post",
    data: formData,
  })
}

// 发布帖子
export const addCommunityAPI = (data: IContent) => {
  return httpInstance({
    url: "/community/add",
    method: 'post',
    data
  })
}

// 点赞接口
export const likeCommunityAPI = (id: number, isLiked: boolean) => {
  return httpInstance({
    url: "/community/like",
    method: 'get',
    params: {
      id,
      isLiked
    }
  })
}

// 收藏接口
export const collectedCommunityAPI = (id: number, isLiked: boolean) => {
  return httpInstance({
    url: "/community/collected",
    method: 'get',
    params: {
      id,
      isLiked
    }
  })
}

// 关注接口
export const followCommunityAPI = (authorId: number, action: 'follow' | 'unfollow') => {
  return httpInstance({
    url: '/community/follow',
    method: 'post',
    data: {
      authorId,
      action
    }
  })
}

// 获取关注列表
export const getFollowingListAPI = () => {
  return httpInstance({
    url: '/community/following',
    method: 'get'
  })
}

// 浏览量接口
export const pageviewsCommunityAPI = (articleId: number) => {
  return httpInstance({
    url: "/community/pageviews",
    method: 'get',
    params: {
      articleId
    }
  })
}

// ai 快速阅读总结文章接口
export const articleQuickReadAPI = (articleId: number) => {
  return httpInstance({
    url: `/community/${articleId}/summary/stream`,
    method: 'post',
  })
}

// ai 生成文章摘要接口
export const articleAbstractAPI = (title: string, content: string) => {
  return httpInstance({
    url: '/community/abstract',
    method: 'post',
    data: {
      title,
      content
    }
  })
}

// ai 提取文章关键词接口
export const articleKeywordsAPI = (title: string, content: string) => {
  return httpInstance({
    url: '/community/keywords',
    method: 'post',
    data: {
      title,
      content
    }
  })
}

// 获取早报的接口
export const getEarlyReportAPI = () => {
  return httpInstance({
    url: '/community/earlyReport',
    method: 'get'
  })
}

// 文件夹相关 
// 创建文件夹
export const createFolderAPI = (data: { name: string; color: string; type: 'collection' | 'history' }) => {
  return httpInstance({ url: '/community/folder', method: 'post', data })
}

// 获取文件夹内容
export const getFoldersAPI = (type: 'collection' | 'history') => {
  return httpInstance({ url: '/community/folders', method: 'get', params: { type } })
}

// 删除文件夹
export const deleteFolderAPI = (id: number) => {
  return httpInstance({ url: `/community/folder/${id}`, method: 'delete' })
}

// 更改文件夹名字
export const renameFolderAPI = (id: number, name: string) => {
  return httpInstance({ url: `/community/folder/${id}`, method: 'put', data: { name } })
}

// 阅读历史相关
// 获取阅读历史
export const getReadingHistoryAPI = (params: { page: number; pageSize: number; folder_id?: number; keyword?: string; sort?: string; date?: string }) => {
  return httpInstance({ url: '/community/history', method: 'get', params })
}

// 删除阅读历史
export const deleteHistoryAPI = (id: number) => {
  return httpInstance({ url: `/community/history/${id}`, method: 'delete' })
}

// 移动阅读历史到文件夹
export const moveHistoryToFolderAPI = (id: number, folder_id: number | null) => {
  return httpInstance({ url: `/community/history/${id}/folder`, method: 'put', data: { folder_id } })
}

// 收藏列表相关
// 获取收藏列表
export const getCollectionListAPI = (params: { page: number; pageSize: number; folder_id?: number; keyword?: string; sort?: string; date?: string }) => {
  return httpInstance({ url: '/community/favorites', method: 'get', params })
}

// 删除收藏
export const deleteCollectionAPI = (id: number) => {
  return httpInstance({ url: `/community/favorites/${id}`, method: 'delete' })
}

// 移动收藏到文件夹
export const moveCollectionToFolderAPI = (id: number, folder_id: number | null) => {
  return httpInstance({ url: `/community/favorites/${id}/folder`, method: 'put', data: { folder_id } })
}

// 获取指定用户的文章列表
export const getUserPostsAPI = (userId: number, params: { sort: 'hot' | 'new'; pageNum: number; pageSize: number }) => {
  return httpInstance({ url: `/community/user/${userId}/posts`, method: 'get', params })
}