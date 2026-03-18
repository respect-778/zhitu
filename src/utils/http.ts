import { message } from 'antd'
import axios from 'axios'
import { delStore, getStore, setStore } from './store'

const BASE_URL = import.meta.env.VITE_BASE_URL

const httpInstance = axios.create({
  baseURL: BASE_URL,
})

let refreshPromise: Promise<string> | null = null // 避免多个请求同时触发刷新 token
let authExpiredHandled = false // 认证过期是否处理

// 给原请求的请求头设置最新的 token
const setAuthorization = (config: { headers?: unknown }, token: string): void => {
  const headers = (config.headers ?? {}) as Record<string, string>
  headers.Authorization = `Bearer ${token}`
  config.headers = headers
}

// 当 refresh token 也过期，就把当前的用户信息、token清除
const clearAuthState = (): void => {
  delStore('token')
  delStore('username')
  delStore('userInfo')
}

// 处理 双token 过期的情况
const handleAuthExpired = (): void => {
  if (authExpiredHandled) return
  authExpiredHandled = true
  clearAuthState()
  message.error('登录已过期，请重新登录')

  setTimeout(() => {
    // 使用整页跳转，确保 Redux 内存态和本地持久态都被重置
    window.location.href = '/login'
  }, 2000)
}

// 刷新 token
const refreshAccessToken = async (): Promise<string> => {
  const response = await axios.post(`${BASE_URL}/user/refresh`, {}, { withCredentials: true })
  const newToken = response.data.token
  setStore('token', newToken)

  return newToken
}

// 对全局共享的 promise 进行处理 -> 当前是否已经刷新过了，为 null 就是没有被刷新，如果有值，那么就是刷新过了，不能重复刷新
const getRefreshPromise = (): Promise<string> => {
  if (refreshPromise === null) {
    refreshPromise = refreshAccessToken().finally(() => { // 刷新结束后清空引用
      refreshPromise = null
    })
  }

  return refreshPromise
}

// 请求拦截器
httpInstance.interceptors.request.use(
  config => {
    // 判断当前请求是否跳过自动加 token 的环节（例如：登录/注册 这些请求就不需要加 旧 token，
    // 这里是要加 新 token，是要等接口响应回来新 token，再通过 setToken 去加 新token。
    if (config.skipAuth) {
      return config
    }

    const token = getStore('token')
    if (token) {
      setAuthorization(config, token)
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
httpInstance.interceptors.response.use(
  response => {
    // 对响应数据做点什么
    return response.data
  },
  async error => {
    const status = error.response?.status // 当前请求状态码
    const originalRequest = error.config // 原请求

    const shouldRefresh = // 是否应该刷新 token
      status === 401 && // 状态码为 401
      !!originalRequest && // 原请求存在
      !originalRequest._retry && // 原请求是第一次请求刷新 token
      !originalRequest.skipRefresh // 原请求不会自动跳过刷新 token

    if (shouldRefresh) {
      originalRequest._retry = true

      try {
        const newToken = await getRefreshPromise() // 获取刷新后的新 token
        setAuthorization(originalRequest, newToken) // 给原请求设置新 token
        return httpInstance(originalRequest) // 重新执行原请求
      } catch (refreshError) {
        handleAuthExpired() // 处理双 token 过期情况
        return Promise.reject(refreshError)
      }
    }

    // 刷新后重试仍然 401，说明会话已失效
    if (status === 401 && originalRequest?._retry) {
      handleAuthExpired()
      return Promise.reject(error)
    }

    const shouldShowMessage = !!status && (status !== 401 || !!originalRequest?.skipRefresh)
    if (shouldShowMessage) {
      message.error(error.response?.data?.message || '请求失败')
    }

    return Promise.reject(error)
  }
)

export default httpInstance
