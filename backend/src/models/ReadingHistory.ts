import { query, queryOne } from '../utils/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface HistoryRow extends RowDataPacket {
  id: number;
  user_id: number;
  post_id: number;
  folder_id: number | null;
  last_read_at: Date;
  read_count: number;
  // JOIN 字段
  title?: string;
  abstract?: string;
  cover?: string;
  username?: string;
  avatar?: string;
}

export class ReadingHistoryModel {
  private static tableChecked = false;

  static async ensureTable(): Promise<void> {
    if (ReadingHistoryModel.tableChecked) return;

    const sql = `
      CREATE TABLE IF NOT EXISTS reading_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        post_id INT NOT NULL,
        folder_id INT DEFAULT NULL,
        last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        read_count INT NOT NULL DEFAULT 1,
        UNIQUE KEY uk_user_post (user_id, post_id),
        INDEX idx_user_time (user_id, last_read_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;
    await query(sql);
    ReadingHistoryModel.tableChecked = true;
  }

  static async upsert(userId: number, postId: number): Promise<void> {
    await ReadingHistoryModel.ensureTable();
    const sql = `
      INSERT INTO reading_history (user_id, post_id, read_count)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE
        last_read_at = CURRENT_TIMESTAMP,
        read_count = read_count + 1
    `;
    await query(sql, [userId, postId]);
  }

  static async findPage(
    userId: number,
    options: { page: number; pageSize: number; folderId?: number; keyword?: string; sort?: 'newest' | 'oldest'; date?: string }
  ): Promise<{ list: HistoryRow[]; total: number }> {
    await ReadingHistoryModel.ensureTable();

    const { page, pageSize, folderId, keyword, sort = 'newest', date } = options;
    const validPage = Math.max(1, Math.floor(page));
    const validSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPage - 1) * validSize;

    let whereClauses = ['rh.user_id = ?'];
    const params: any[] = [userId];

    if (folderId !== undefined && folderId !== null) {
      whereClauses.push('rh.folder_id = ?');
      params.push(folderId);
    }

    if (keyword) {
      whereClauses.push('(p.title LIKE ? OR p.content LIKE ?)');
      const pattern = `%${keyword}%`;
      params.push(pattern, pattern);
    }

    if (date) {
      whereClauses.push('DATE(rh.last_read_at) = ?');
      params.push(date);
    }

    const whereStr = whereClauses.join(' AND ');
    const orderDir = sort === 'oldest' ? 'ASC' : 'DESC';

    const countSql = `
      SELECT COUNT(*) as total
      FROM reading_history rh
      LEFT JOIN posts p ON rh.post_id = p.id
      WHERE ${whereStr}
    `;
    const countResult = await queryOne<{ total: number }>(countSql, params);
    const total = countResult?.total || 0;

    const listSql = `
      SELECT rh.*, p.title, p.abstract, p.cover, u.username, u.avatar
      FROM reading_history rh
      LEFT JOIN posts p ON rh.post_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereStr}
      ORDER BY rh.last_read_at ${orderDir}
      LIMIT ${validSize} OFFSET ${offset}
    `;
    const list = await query<HistoryRow[]>(listSql, params);
    return { list, total };
  }

  static async delete(id: number, userId: number): Promise<boolean> {
    await ReadingHistoryModel.ensureTable();
    const sql = 'DELETE FROM reading_history WHERE id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [id, userId]);
    return result.affectedRows > 0;
  }

  static async moveToFolder(id: number, userId: number, folderId: number | null): Promise<boolean> {
    await ReadingHistoryModel.ensureTable();
    const sql = 'UPDATE reading_history SET folder_id = ? WHERE id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [folderId, id, userId]);
    return result.affectedRows > 0;
  }

  static async getCount(userId: number): Promise<number> {
    await ReadingHistoryModel.ensureTable();
    const sql = 'SELECT COUNT(*) as total FROM reading_history WHERE user_id = ?';
    const result = await queryOne<{ total: number }>(sql, [userId]);
    return result?.total || 0;
  }
}
