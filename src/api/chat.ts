import httpInstance from "@/utils/http"

// 调用 AI 大模型
export const callChatAPI = (mode: number, userMessage: string) => {
  return httpInstance({
    url: '/api/chat/call',
    method: 'post',
    data: {
      mode,
      userMessage
    }
  })
}

// 根据 会话id 查找对应的聊天记录
export const getChatMessageAPI = (session_id: number) => {
  return httpInstance({
    url: '/api/chat/getMessage',
    method: 'get',
    params: {
      session_id
    }
  })
}

// 获取所有历史会话记录
export const getHistorySessionAPI = () => {
  return httpInstance({
    url: '/api/chat/history',
    method: 'get',
  })
}

// 创建聊天记录
export const addChatMessageAPI = (data: { session_id: number, role: string, content: string }) => {
  return httpInstance({
    url: '/api/chat/addMessage',
    method: 'post',
    data
  })
}

// 创建聊天会话
export const addChatSessionAPI = (data: { user_id: number, session_title: string }) => {
  return httpInstance({
    url: '/api/chat/addSession',
    method: 'post',
    data
  })
}

// 删除聊天会话
export const delChatSessionAPI = (session_id: number) => {
  return httpInstance({
    url: 'api/chat/delSession/' + session_id,
    method: 'delete',
  })
}