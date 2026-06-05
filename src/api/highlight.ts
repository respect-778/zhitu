import httpInstance from '@/utils/http'
import { getStore } from '@/utils/store'
import type { Highlight } from '@/types/highlight'

// 获取用户在某篇文章上的高亮数据
export const getHighlightsAPI = (postId: number): Promise<{ data: Highlight[] }> => {
  return httpInstance({ url: `/growth/highlights/${postId}`, method: 'get' })
}

// 批量保存高亮（整体替换）
export const saveHighlightsAPI = (postId: number, highlights: Highlight[]): Promise<{ message: string }> => {
  return httpInstance({ url: `/growth/highlights/${postId}`, method: 'put', data: { highlights } })
}

// 添加引用到学习规划
export const addCitationAPI = (data: { text: string; sourceId: number; sourceTitle: string }): Promise<{ data: { fileId: string } }> => {
  return httpInstance({ url: '/growth/cite', method: 'post', data })
}

// 页面卸载时用 fetch + keepalive 同步保存
export const saveHighlightsSync = (postId: number, highlights: Highlight[]) => {
  const token = getStore('token')
  const baseURL = import.meta.env.VITE_BASE_URL
  fetch(`${baseURL}/growth/highlights/${postId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ highlights }),
    keepalive: true,
  }).catch(() => {})
}
