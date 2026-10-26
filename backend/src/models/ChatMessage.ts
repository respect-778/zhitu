import { query, queryOne } from '../utils/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { ChatSessionModel } from './ChatSession';

export interface ChatMessageRow extends RowDataPacket {
  id: number;
  session_id: number;
  role: 'user' | 'ai';
  content: string;
  reasoning_content: string | null;  // 模型原生推理过程（DeepSeek reasoning_content 等）
  content_type: 'text' | 'voice';
  audio_url: string | null;
  thinking_mode: number;
  token_usage: number;
  created_at: Date;
}

export class ChatMessageModel {
  // 创建聊天消息
  static async create(messageData: {
    session_id: number;
    role: 'user' | 'ai';
    content: string;
    reasoning_content?: string | null;  // 模型原生推理过程
    content_type?: 'text' | 'voice';
    audio_url?: string | null;
    thinking_mode?: number;
    token_usage?: number;
  }): Promise<number> {
    const sql = `
      INSERT INTO ai_chat_message
      (session_id, role, content, reasoning_content, content_type, audio_url, thinking_mode, token_usage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      messageData.session_id,
      messageData.role,
      messageData.content,
      messageData.reasoning_content || null,
      messageData.content_type || 'text',
      messageData.audio_url || null,
      messageData.thinking_mode || 0,
      messageData.token_usage || 0
    ];

    const result = await query<ResultSetHeader>(sql, params);
    const messageId = result.insertId;

    // 创建消息后更新会话的 updated_at 时间戳
    try {
      await ChatSessionModel.updateTimestamp(messageData.session_id);
    } catch (error) {
      console.error('更新会话时间戳失败:', error);
    }

    return messageId;
  }

  // 根据会话 ID 获取所有消息
  static async getBySessionId(sessionId: number): Promise<ChatMessageRow[]> {
    const sql = `
      SELECT * FROM ai_chat_message
      WHERE session_id = ?
      ORDER BY created_at ASC, id ASC
    `;
    return query<ChatMessageRow[]>(sql, [sessionId]);
  }

  // 获取最近的一条消息
  static async getLatest(sessionId: number): Promise<ChatMessageRow | null> {
    const sql = `
      SELECT * FROM ai_chat_message
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return queryOne<ChatMessageRow>(sql, [sessionId]);
  }

  // 获取指定消息 ID 之后的消息（用于加载未被摘要覆盖的近期消息）
  static async getAfterMessageId(sessionId: number, afterId: number): Promise<ChatMessageRow[]> {
    const sql = `
      SELECT * FROM ai_chat_message
      WHERE session_id = ? AND id > ?
      ORDER BY created_at ASC
    `;
    return query<ChatMessageRow[]>(sql, [sessionId, afterId]);
  }

  // 获取会话的消息总数（用于判断是否需要触发历史压缩）
  static async countBySessionId(sessionId: number): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM ai_chat_message WHERE session_id = ?';
    const row = await queryOne<RowDataPacket>(sql, [sessionId]);
    return row?.count || 0;
  }

  // 删除当前用户某个会话里的单条 AI 消息
  static async deleteAiMessageByIdForUser(messageId: number, userId: number): Promise<boolean> {
    const sql = `
      DELETE m FROM ai_chat_message m
      INNER JOIN ai_chat_session s ON s.id = m.session_id
      WHERE m.id = ?
        AND m.role = 'ai'
        AND s.user_id = ?
        AND s.is_deleted = 0
    `;
    const result = await query<ResultSetHeader>(sql, [messageId, userId]);
    return result.affectedRows > 0;
  }

  // 删除会话的所有消息
  static async deleteBySessionId(sessionId: number): Promise<boolean> {
    const sql = 'DELETE FROM ai_chat_message WHERE session_id = ?';
    const result = await query<ResultSetHeader>(sql, [sessionId]);
    return result.affectedRows > 0;
  }
}
