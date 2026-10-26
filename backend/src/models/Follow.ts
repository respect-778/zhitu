import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, queryOne } from '../utils/db';

export interface FollowRow extends RowDataPacket {
  id: number;
  follower_id: number;
  following_id: number;
  created_at: Date;
}

export class FollowModel {
  static async create(followerId: number, followingId: number): Promise<boolean> {
    try {
      const sql = 'INSERT INTO follows (follower_id, following_id) VALUES (?, ?)';
      await query<ResultSetHeader>(sql, [followerId, followingId]);
      return true;
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        return false;
      }
      throw error;
    }
  }

  static async delete(followerId: number, followingId: number): Promise<boolean> {
    const sql = 'DELETE FROM follows WHERE follower_id = ? AND following_id = ?';
    const result = await query<ResultSetHeader>(sql, [followerId, followingId]);
    return result.affectedRows > 0;
  }

  static async exists(followerId: number, followingId: number): Promise<boolean> {
    const sql = 'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?';
    const result = await queryOne<FollowRow>(sql, [followerId, followingId]);
    return result !== null;
  }

  static async getFollowing(userId: number): Promise<number[]> {
    const sql = 'SELECT following_id FROM follows WHERE follower_id = ?';
    const results = await query<FollowRow[]>(sql, [userId]);
    return results.map((row) => row.following_id);
  }

  static async getFollowers(userId: number): Promise<number[]> {
    const sql = 'SELECT follower_id FROM follows WHERE following_id = ?';
    const results = await query<FollowRow[]>(sql, [userId]);
    return results.map((row) => row.follower_id);
  }

  static async countFollowing(userId: number): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?';
    const result = await queryOne<{ count: number }>(sql, [userId]);
    return result?.count || 0;
  }

  static async countFollowers(userId: number): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM follows WHERE following_id = ?';
    const result = await queryOne<{ count: number }>(sql, [userId]);
    return result?.count || 0;
  }
}
