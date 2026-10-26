import { query, queryOne } from '../utils/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface FavoriteRow extends RowDataPacket {
  id: number;
  post_id: number;
  user_id: number;
  folder_id: number | null;
  created_at: Date;
  // JOIN 字段
  title?: string;
  abstract?: string;
  cover?: string;
  username?: string;
  avatar?: string;
}

export class FavoriteModel {
  private static folderColumnChecked = false;

  private static async ensureFolderColumn(): Promise<void> {
    if (FavoriteModel.folderColumnChecked) return;

    const row = await queryOne<{ Field: string }>(
      "SHOW COLUMNS FROM favorites LIKE 'folder_id'"
    );

    if (!row) {
      await query(
        "ALTER TABLE favorites ADD COLUMN folder_id INT DEFAULT NULL AFTER user_id"
      );
    }

    FavoriteModel.folderColumnChecked = true;
  }

  // 添加收藏
  static async create(postId: number, userId: number): Promise<boolean> {
    try {
      const sql = 'INSERT INTO favorites (post_id, user_id) VALUES (?, ?)';
      await query<ResultSetHeader>(sql, [postId, userId]);
      return true;
    } catch (error: any) {
      // 如果是重复收藏错误（唯一索引冲突），返回 false
      if (error.code === 'ER_DUP_ENTRY') {
        return false;
      }
      throw error;
    }
  }

  // 取消收藏
  static async delete(postId: number, userId: number): Promise<boolean> {
    const sql = 'DELETE FROM favorites WHERE post_id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [postId, userId]);
    return result.affectedRows > 0;
  }

  // 按 id 删除收藏记录
  static async deleteById(id: number, userId: number): Promise<boolean> {
    const sql = 'DELETE FROM favorites WHERE id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [id, userId]);
    return result.affectedRows > 0;
  }

  // 检查用户是否已收藏
  static async exists(postId: number, userId: number): Promise<boolean> {
    const sql = 'SELECT id FROM favorites WHERE post_id = ? AND user_id = ?';
    const result = await queryOne<FavoriteRow>(sql, [postId, userId]);
    return result !== null;
  }

  // 获取用户的收藏列表
  static async findByUserId(userId: number): Promise<FavoriteRow[]> {
    const sql = 'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC';
    return query<FavoriteRow[]>(sql, [userId]);
  }

  // 分页获取收藏列表（带文章详情）
  static async findPage(
    userId: number,
    options: { page: number; pageSize: number; folderId?: number; keyword?: string; sort?: 'newest' | 'oldest'; date?: string }
  ): Promise<{ list: FavoriteRow[]; total: number }> {
    await FavoriteModel.ensureFolderColumn();

    const { page, pageSize, folderId, keyword, sort = 'newest', date } = options;
    const validPage = Math.max(1, Math.floor(page));
    const validSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPage - 1) * validSize;

    let whereClauses = ['f.user_id = ?'];
    const params: any[] = [userId];

    if (folderId !== undefined && folderId !== null) {
      whereClauses.push('f.folder_id = ?');
      params.push(folderId);
    }

    if (keyword) {
      whereClauses.push('(p.title LIKE ? OR p.content LIKE ?)');
      const pattern = `%${keyword}%`;
      params.push(pattern, pattern);
    }

    if (date) {
      whereClauses.push('DATE(f.created_at) = ?');
      params.push(date);
    }

    const whereStr = whereClauses.join(' AND ');
    const orderDir = sort === 'oldest' ? 'ASC' : 'DESC';

    const countSql = `
      SELECT COUNT(*) as total
      FROM favorites f
      LEFT JOIN posts p ON f.post_id = p.id
      WHERE ${whereStr}
    `;
    const countResult = await queryOne<{ total: number }>(countSql, params);
    const total = countResult?.total || 0;

    const listSql = `
      SELECT f.*, p.title, p.abstract, p.cover, u.username, u.avatar
      FROM favorites f
      LEFT JOIN posts p ON f.post_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereStr}
      ORDER BY f.created_at ${orderDir}
      LIMIT ${validSize} OFFSET ${offset}
    `;
    const list = await query<FavoriteRow[]>(listSql, params);
    return { list, total };
  }

  // 移入文件夹
  static async moveToFolder(id: number, userId: number, folderId: number | null): Promise<boolean> {
    await FavoriteModel.ensureFolderColumn();
    const sql = 'UPDATE favorites SET folder_id = ? WHERE id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [folderId, id, userId]);
    return result.affectedRows > 0;
  }

  // 获取收藏总数
  static async getCount(userId: number): Promise<number> {
    const sql = 'SELECT COUNT(*) as total FROM favorites WHERE user_id = ?';
    const result = await queryOne<{ total: number }>(sql, [userId]);
    return result?.total || 0;
  }

  static async findPostIdsByUserAndPostIds(userId: number, postIds: number[]): Promise<number[]> {
    const ids = Array.from(new Set(postIds.filter((n) => Number.isFinite(n) && n > 0)));
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const sql = `SELECT post_id FROM favorites WHERE user_id = ? AND post_id IN (${placeholders})`;
    const rows = await query<Array<{ post_id: number }>>(sql, [userId, ...ids]);
    return rows.map((r) => r.post_id);
  }
}
