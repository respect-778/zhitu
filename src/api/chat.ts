import httpInstance from "@/utils/http"
import { delStore, getStore } from "@/utils/store"
import { message } from "antd"
import { refreshAccessTokenByFetch } from "./token"

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


// 流式调用 AI 大模型（SSE）
export const callChatStreamAPI = async (
  mode: number,
  userMessage: string,
  session_id: number | null,
  onMessage: (content: string) => void,
  onError?: (error: string) => void,
  _retried: boolean = false, // 默认第一次是 false
  signal?: AbortSignal // 用于取消请求
): Promise<string> => {
  const response = await fetch('/api/chat/call', { // 这里走的 fetch 所以没有基地址，这里需要加上 /api
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getStore('token')}` // 添加 access token
    },
    body: JSON.stringify({ mode, userMessage, session_id }),
    signal: signal // 用于取消请求
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
  let sseBuffer = '' // 处理 SSE 半包数据

  try {
    const processSseEvent = (eventText: string): boolean => {
      const dataLines = eventText
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6))

      if (dataLines.length === 0) return false

      const data = dataLines.join('\n').trim()
      if (!data) return false

      if (data === '[DONE]') {
        return true
      }

      let parsed: { content?: string, error?: string }
      try {
        parsed = JSON.parse(data)
      } catch {
        // 非完整 JSON 或非业务数据，忽略
        return false
      }

      if (parsed.content) {
        fullContent += parsed.content
        onMessage(fullContent) // 回调，传递当前完整内容
      }

      if (parsed.error) {
        if (onError) {
          onError(parsed.error)
        }
        throw new Error(parsed.error)
      }

      return false
    }

    while (true) {
      // done: 流是否结束（boolean）
      // value: 这次读取到的二进制数据（Uint8Array）
      const { done, value } = await reader.read()

      // 流结束时把解码器剩余内容冲刷出来
      if (done) {
        sseBuffer += decoder.decode()
      } else {
        // 把二进制转成字符串
        // { stream: true } 表示可能还有后续数据，保持解码器状态
        sseBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      }

      // SSE 事件以空行分隔；保留最后一段残片等待下一个 chunk 拼接
      const events = sseBuffer.split('\n\n')
      sseBuffer = done ? '' : (events.pop() ?? '')

      for (const eventText of events) {
        if (processSseEvent(eventText)) {
          return fullContent
        }
      }

      if (done) {
        // 最后一段没有以空行结束时，也尝试解析一次
        if (sseBuffer.trim()) {
          processSseEvent(sseBuffer)
        }
        break
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

// 根据 文章id 查找对应的聊天记录
export const getSummaryMessageAPI = (article_id: number) => {
  return httpInstance({
    url: '/chat/getSummaryMessage',
    method: 'get',
    params: {
      article_id
    }
  })
}

// 根据场景类型获取历史会话记录
export const getHistorySessionAPI = (scene_type?: string) => {
  return httpInstance({
    url: '/chat/history',
    method: 'get',
    params: {
      scene_type
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
export const addChatSessionAPI = (data: { user_id: number, session_title: string, scene_type?: string, source_id?: number }) => {
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

// 重命名聊天会话标题
export const renameChatSessionTitleAPI = (session_id: number, title: string) => {
  return httpInstance({
    url: '/chat/renameTitle',
    method: 'post',
    data: {
      session_id,
      title
    }
  })
}

// 上传 ai name 和 apikey
export const uploadAiModelAPI = (name: string, apikey: string) => {
  return httpInstance({
    url: '/chat/uploadAiModel',
    method: 'post',
    data: {
      name,
      apikey
    }
  })
}

// 获取当前用户正在使用的 ai 厂商
export const getAiModelAPI = () => {
  return httpInstance({
    url: '/chat/getAiModel',
    method: 'get'
  })
}