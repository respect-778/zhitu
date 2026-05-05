import { setStore } from "@/utils/store";

// 刷新 access token（refresh token 在 HttpOnly Cookie 里，所以要带 credentials）
export const refreshAccessTokenByFetch = async (): Promise<string> => {
  const res = await fetch('/api/user/refresh', {
    method: 'POST',
    credentials: 'include'
  })

  if (!res.ok) {
    throw new Error('刷新 token 失败')
  }

  const data = await res.json()
  const newToken = data?.token

  if (!newToken) {
    throw new Error('刷新 token 失败')
  }

  setStore('token', newToken)
  return newToken
}