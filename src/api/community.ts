import type { IContent } from "@/types/community";
import httpInstance from "@/utils/http";

// 获取帖子列表
export const getCommunityListAPI = () => {
  return httpInstance({
    url: "/community/list",
    method: "get"
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
    url: "/api/community/search",
    method: "get",
    params
  })
}

// 根据 id 获取帖子数据
export const getCommunityByIdAPI = (id: number) => {
  return httpInstance({
    url: `/api/community/${id}`,
    method: 'get'
  })
}

// 上传图片接口，后端返回正确的图片格式
export const uploadImageAPI = (formData: FormData) => {
  return httpInstance({
    url: "/api/community/image",
    method: "post",
    data: formData,
  })
}

// 发布帖子
export const addCommunityAPI = (data: IContent) => {
  return httpInstance({
    url: "/api/community/add",
    method: 'post',
    data
  })
}

// 点赞接口
export const likeCommunityAPI = (id: number, isLiked: boolean) => {
  return httpInstance({
    url: "/api/community/like",
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
    url: "/api/community/collected",
    method: 'get',
    params: {
      id,
      isLiked
    }
  })
}
