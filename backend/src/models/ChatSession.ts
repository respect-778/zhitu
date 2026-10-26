import { randomUUID } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, queryOne } from '../utils/db';

export interface ChatSessionRow extends RowDataPacket {
  id: number;
  uuid: string;
  user_id: number;
  session_title: string;
  scene_type: string | null;
  source_id: number | null;
  history_summary: string | null;
  summary_up_to_id: number | null;
  is_deleted: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateChatSessionResult {
  id: number;
  uuid: string;
}

export class ChatSessionModel {
  static async create(sessionData: {
    user_id: number;
    session_title: string;
    scene_type?: string | null;
    source_id?: number | null;
  }): Promise<CreateChatSessionResult> {
    const uuid = randomUUID();
    const sql = `
      INSERT INTO ai_chat_session (uuid, user_id, session_title, scene_type, source_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [
      uuid,
      sessionData.user_id,
      sessionData.session_title,
      sessionData.scene_type ?? 'chat',
      sessionData.source_id ?? null
    ];

    const result = await query<ResultSetHeader>(sql, params);
    return { id: result.insertId, uuid };
  }

  static async getAllHistory(userId?: number, sceneType?: string): Promise<ChatSessionRow[]> {
    let sql = `
      SELECT * FROM ai_chat_session
      WHERE is_deleted = 0
    `;
    const params: any[] = [];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (sceneType) {
      if (sceneType === 'chat') {
        sql += ' AND (scene_type = ? OR scene_type IS NULL)';
        params.push(sceneType);
      } else {
        sql += ' AND scene_type = ?';
        params.push(sceneType);
      }
    }

    sql += ' ORDER BY updated_at DESC';

    return query<ChatSessionRow[]>(sql, params);
  }

  static async findById(id: number): Promise<ChatSessionRow | null> {
    const sql = 'SELECT * FROM ai_chat_session WHERE id = ? AND is_deleted = 0';
    return queryOne<ChatSessionRow>(sql, [id]);
  }

  static async findByUuid(uuid: string): Promise<ChatSessionRow | null> {
    const sql = 'SELECT * FROM ai_chat_session WHERE uuid = ? AND is_deleted = 0';
    return queryOne<ChatSessionRow>(sql, [uuid]);
  }

  static async findByIdAndUserId(id: number, userId: number): Promise<ChatSessionRow | null> {
    const sql = 'SELECT * FROM ai_chat_session WHERE id = ? AND user_id = ? AND is_deleted = 0';
    return queryOne<ChatSessionRow>(sql, [id, userId]);
  }

  static async findByUuidAndUserId(uuid: string, userId: number): Promise<ChatSessionRow | null> {
    const sql = 'SELECT * FROM ai_chat_session WHERE uuid = ? AND user_id = ? AND is_deleted = 0';
    return queryOne<ChatSessionRow>(sql, [uuid, userId]);
  }

  static async findBySceneAndSource(
    userId: number,
    sceneType: string,
    sourceId: number
  ): Promise<ChatSessionRow | null> {
    const sql = `
      SELECT *
      FROM ai_chat_session
      WHERE user_id = ?
        AND scene_type = ?
        AND source_id = ?
        AND is_deleted = 0
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return queryOne<ChatSessionRow>(sql, [userId, sceneType, sourceId]);
  }

  static async updateTitle(id: number, title: string): Promise<boolean> {
    const sql = 'UPDATE ai_chat_session SET session_title = ? WHERE id = ?';
    const result = await query<ResultSetHeader>(sql, [title, id]);
    return result.affectedRows > 0;
  }

  static async softDelete(id: number): Promise<boolean> {
    const sql = 'UPDATE ai_chat_session SET is_deleted = 1 WHERE id = ?';
    const result = await query<ResultSetHeader>(sql, [id]);
    return result.affectedRows > 0;
  }

  static async updateTimestamp(id: number): Promise<boolean> {
    const sql = 'UPDATE ai_chat_session SET updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const result = await query<ResultSetHeader>(sql, [id]);
    return result.affectedRows > 0;
  }

  static async updateHistorySummary(
    sessionId: number,
    summary: string,
    upToMessageId: number
  ): Promise<boolean> {
    const sql = `
      UPDATE ai_chat_session
      SET history_summary = ?, summary_up_to_id = ?
      WHERE id = ?
    `;
    const result = await query<ResultSetHeader>(sql, [summary, upToMessageId, sessionId]);
    return result.affectedRows > 0;
  }
}
