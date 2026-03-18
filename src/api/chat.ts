import httpInstance from "@/utils/http"
import { delStore, getStore, setStore } from "@/utils/store"
import { message } from "antd"

// // 调用 AI 大模型（非流式，兼容旧接口）
// export const callChatAPI = (mode: number, userMessage: string) => {
//   return httpInstance({
//     url: '/chat/call',
//     method: 'post',
//     data: {
//       mode,
//       userMessage
//     }
//   })
// }

// 刷新 access token（refresh token 在 HttpOnly Cookie 里，所以要带 credentials）
const refreshAccessTokenByFetch = async (): Promise<string> => {
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

// 流式调用 AI 大模型（SSE）
export const callChatStreamAPI = async (
  mode: number,
  userMessage: string,
  session_id: number | null,
  onMessage: (content: string) => void,
  onError?: (error: string) => void,
  _retried: boolean = false // 默认第一次是 false
): Promise<string> => {
  const response = await fetch('/api/chat/call', { // 这里走的 fetch 所以没有基地址，这里需要加上 /api
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getStore('token')}` // 添加 access token
    },
    body: JSON.stringify({ mode, userMessage, session_id }),
  })

  // 对 access token 授权失效情况的处理
  if (response.status === 401 && !_retried) { // 状态为 401 并且是第一次调用
    try {
      await refreshAccessTokenByFetch() // 设置最新 token
      return callChatStreamAPI(mode, userMessage, session_id, onMessage, onError, true) // 重新调用原请求
    } catch (error) {
      // 双 token 都失效时，清理并回登录页
      delStore('token')
      delStore('username')
      delStore('userInfo')
      message.error('登录已过期，请重新登录')
      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)

      throw error
    }
  }

  // 非 2xx 的响应不进入 SSE 解析，直接抛错给上层
  if (!response.ok) {
    let errorMessage = '请求失败'
    try {
      const data = await response.json() as { message?: string }
      if (data?.message) {
        errorMessage = data.message
      }
    } catch {
      // 忽略解析失败，走默认错误文案
    }

    if (onError) {
      onError(errorMessage)
    }

    throw new Error(errorMessage)
  }

  if (!response.body) {
    throw new Error('无法获取响应流')
  }

  const reader = response.body.getReader() // 获取流的读取器
  const decoder = new TextDecoder() // 创建文本解码器 -> 因为网络传输的是二进制，需要使用把二进制转为人类可读的字符串
  let fullContent = ''

  try {
    while (true) {
      // done: 流是否结束（boolean）
      // value: 这次读取到的二进制数据（Uint8Array）
      const { done, value } = await reader.read()

      // 数据全部传完了，结束了，就退出循环
      if (done) break

      // 把二进制转成字符串
      // { stream: true } 表示可能还有后续数据，保持解码器状态
      const chunk = decoder.decode(value, { stream: true })

      // SSE 格式是多行文本，按 \n 分割
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue

        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          return fullContent
        }

        try {
          const parsed = JSON.parse(data)
          if (parsed.content) {
            fullContent += parsed.content
            onMessage(fullContent)  // 回调，传递当前完整内容
          }
          if (parsed.error) {
            if (onError) {
              onError(parsed.error)
            }
            throw new Error(parsed.error)
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  } catch (error) {
    console.error('流式读取错误:', error)
    throw error
  } finally {
    reader.releaseLock()
  }

  return fullContent
}

// 根据 会话id 查找对应的聊天记录
export const getChatMessageAPI = (session_id: number) => {
  return httpInstance({
    url: '/chat/getMessage',
    method: 'get',
    params: {
      session_id
    }
  })
}

// 根据 user_id 获取用户对应的历史会话记录
export const getHistorySessionAPI = (user_id: number) => {
  return httpInstance({
    url: '/chat/history',
    method: 'get',
    params: {
      user_id
    }
  })
}

// 创建聊天记录
export const addChatMessageAPI = (data: { session_id: number, role: string, content: string }) => {
  return httpInstance({
    url: '/chat/addMessage',
    method: 'post',
    data
  })
}

// 创建聊天会话
export const addChatSessionAPI = (data: { user_id: number, session_title: string }) => {
  return httpInstance({
    url: '/chat/addSession',
    method: 'post',
    data
  })
}

// 删除聊天会话
export const delChatSessionAPI = (session_id: number) => {
  return httpInstance({
    url: '/chat/delSession/' + session_id,
    method: 'delete',
  })
}
