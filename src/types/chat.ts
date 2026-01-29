// chat 会话类型
export interface IChatSession {
  id?: number // 会话 id
  user_id: number // 用户 id
  session_title: string // 会话标题
  is_deleted?: number // 是否删除
  created_at?: string // 创建时间
  updated_at?: string // 更新时间
}

// chat 聊天记录类型
export interface IChatMessage {
  id?: number // 消息 id
  session_id?: number // 会话 id
  role: 'user' | 'ai' // 角色
  content: string // 消息内容
  content_type?: 'text' | 'voice' // 内容类型
  audio_url?: string | null // 语音地址 （TTS）
  thinking_mode: number // 是否深度思考 0 为否
  token_usage?: number // token消耗
  created_at?: string // 创建时间
}