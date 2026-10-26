import { query, queryOne } from '../utils/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface FolderRow extends RowDataPacket {
  id: number;
  user_id: number;
  name: string;
  color: string;
  type: 'collection' | 'history';
  created_at: Date;
  updated_at: Date;
}

export class UserFolderModel {
  private static tableChecked = false;

  static async ensureTable(): Promise<void> {
    if (UserFolderModel.tableChecked) return;

    const sql = `
      CREATE TABLE IF NOT EXISTS user_folders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
        type ENUM('collection', 'history') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_type (user_id, type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;
    await query(sql);
    UserFolderModel.tableChecked = true;
  }

  static async create(userId: number, name: string, color: string, type: 'collection' | 'history'): Promise<number> {
    await UserFolderModel.ensureTable();
    const sql = 'INSERT INTO user_folders (user_id, name, color, type) VALUES (?, ?, ?, ?)';
    const result = await query<ResultSetHeader>(sql, [userId, name, color, type]);
    return result.insertId;
  }

  static async findByUser(userId: number, type: 'collection' | 'history'): Promise<FolderRow[]> {
    await UserFolderModel.ensureTable();
    const sql = 'SELECT * FROM user_folders WHERE user_id = ? AND type = ? ORDER BY created_at DESC';
    return query<FolderRow[]>(sql, [userId, type]);
  }

  static async findById(id: number): Promise<FolderRow | null> {
    await UserFolderModel.ensureTable();
    const sql = 'SELECT * FROM user_folders WHERE id = ?';
    return queryOne<FolderRow>(sql, [id]);
  }

  static async delete(id: number, userId: number): Promise<boolean> {
    await UserFolderModel.ensureTable();
    const sql = 'DELETE FROM user_folders WHERE id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [id, userId]);
    return result.affectedRows > 0;
  }

  static async rename(id: number, userId: number, name: string): Promise<boolean> {
    await UserFolderModel.ensureTable();
    const sql = 'UPDATE user_folders SET name = ? WHERE id = ? AND user_id = ?';
    const result = await query<ResultSetHeader>(sql, [name, id, userId]);
    return result.affectedRows > 0;
  }
}
