import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '../utils/db';
import pool from '../utils/db';

interface UserHighlightRow extends RowDataPacket {
  id: number;
  user_id: number;
  post_id: number;
  highlight_id: string;
  text: string;
  text_before: string;
  text_after: string;
  color: string;
  note: string;
  created_at: Date;
}

interface HighlightInput {
  id: string;
  text: string;
  textBefore: string;
  textAfter: string;
  color: string;
  note: string;
  createdAt: string;
}

export class UserHighlightModel {
  // 获取用户在某篇文章的全部高亮
  static async getByPostId(userId: number, postId: number): Promise<UserHighlightRow[]> {
    return query<UserHighlightRow[]>(
      'SELECT * FROM user_highlights WHERE user_id = ? AND post_id = ? ORDER BY created_at',
      [userId, postId]
    );
  }

  // 先清空再批量插入，实现整体替换
  static async batchReplace(userId: number, postId: number, highlights: HighlightInput[]): Promise<void> {
    await query<ResultSetHeader>(
      'DELETE FROM user_highlights WHERE user_id = ? AND post_id = ?',
      [userId, postId]
    );

    if (highlights.length === 0) return;

    const values = highlights.map(h => [
      userId, postId, h.id, h.text,
      h.textBefore || '', h.textAfter || '',
      h.color, h.note || '',
      h.createdAt.replace('T', ' ').replace('Z', ''),
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    // 动态占位符数量不能用 execute(prepared statement)，改用 pool.query
    const [rows] = await pool.query<ResultSetHeader>(
      `INSERT INTO user_highlights (user_id, post_id, highlight_id, text, text_before, text_after, color, note, created_at) VALUES ${placeholders}`,
      values.flat()
    );
  }
}
