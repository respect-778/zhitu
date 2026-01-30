import httpInstance from "@/utils/http"

// 调用 AI 大模型（非流式，兼容旧接口）
export const callChatAPI = (mode: number, userMessage: string) => {
  return httpInstance({
    url: '/chat/call',
    method: 'post',
    data: {
      mode,
      userMessage
    }
  })
}

// 流式调用 AI 大模型（SSE）
export const callChatStreamAPI = async (
  mode: number,
  userMessage: string,
  session_id: number | null,
  onMessage: (content: string) => void,
  onError?: (error: string) => void
) => {
  const response = await fetch('/api/chat/call', { // 这里走的 fetch 所以没有基地址，这里需要加上 /api
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode, userMessage, session_id }),
  })

  if (!response.body) {
    throw new Error('无法获取响应流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
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

// 获取所有历史会话记录
export const getHistorySessionAPI = () => {
  return httpInstance({
    url: '/chat/history',
    method: 'get',
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
