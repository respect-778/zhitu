import httpInstance from "@/utils/http"

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
