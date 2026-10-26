import { query, queryOne } from '../utils/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface LikeRow extends RowDataPacket {
  id: number;
  post_id: number;
  user_id: number;
  created_at: Date;
}

export class LikeModel {
  // 添加点赞
  static async create(postId: number, userId: number): Promise<boolean> {
    try {
      const sql = 'INSERT INTO likes (post_id, user_id) VALUES (?, ?)';
      await query<ResultSetHeader>(sql, [postId, userId]);
      return true;
    } catch (error: any) {
      // 如果是重复点赞错误（唯一索引冲突），返回 false
      if (error.code === 'ER_DUP_ENTRY') {
        return false;
      }
      throw error;
    }
  }

  // 取消点赞
  static async delete(postId: number, userId: number): Promise<boolean> {
    const sql = 'DELETE FROM likes WHERE post_id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [postId, userId]);
    return result.affectedRows > 0;
  }

  // 检查用户是否已点赞
  static async exists(postId: number, userId: number): Promise<boolean> {
    const sql = 'SELECT id FROM likes WHERE post_id = ? AND user_id = ?';
    const result = await queryOne<LikeRow>(sql, [postId, userId]);
    return result !== null;
  }

  // 获取帖子的点赞数
  static async getCount(postId: number): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM likes WHERE post_id = ?';
    const result = await queryOne<{ count: number }>(sql, [postId]);
    return result?.count || 0;
  }

  static async findPostIdsByUserAndPostIds(userId: number, postIds: number[]): Promise<number[]> {
    const ids = Array.from(new Set(postIds.filter((n) => Number.isFinite(n) && n > 0)));
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const sql = `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${placeholders})`;
    const rows = await query<Array<{ post_id: number }>>(sql, [userId, ...ids]);
    return rows.map((r) => r.post_id);
  }
}
