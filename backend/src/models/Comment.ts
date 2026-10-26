import { query, queryOne } from '../utils/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface CommentRow extends RowDataPacket {
  id: number;
  post_id: number;
  user_id: number;
  content: string;
  created_at: Date;
  username?: string;
  avatar?: string;
}

export class CommentModel {
  // 创建评论
  static async create(commentData: {
    post_id: number;
    user_id: number;
    content: string;
  }): Promise<number> {
    const sql = `
      INSERT INTO comments (post_id, user_id, content)
      VALUES (?, ?, ?)
    `;
    const params = [commentData.post_id, commentData.user_id, commentData.content];
    const result = await query<ResultSetHeader>(sql, params);
    return result.insertId;
  }

  // 获取帖子的所有评论
  static async findByPostId(postId: number): Promise<CommentRow[]> {
    const sql = `
      SELECT c.*, u.username, u.avatar
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at DESC
    `;
    return query<CommentRow[]>(sql, [postId]);
  }

  // 删除评论
  static async delete(id: number): Promise<boolean> {
    const sql = 'DELETE FROM comments WHERE id = ?';
    const result = await query<ResultSetHeader>(sql, [id]);
    return result.affectedRows > 0;
  }
}
