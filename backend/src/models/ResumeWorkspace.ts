import { RowDataPacket } from 'mysql2';
import pool, { query, queryOne } from '../utils/db';
import { WorkspaceConflictError, WorkspaceSnapshot } from './GrowthWorkspace';

export interface ResumeWorkspaceRow extends RowDataPacket {
  user_id: number;
  data: string | Record<string, any>;
  revision: number;
}

export class ResumeWorkspaceModel {
  static async ensureSchema(): Promise<void> {
    await query(`CREATE TABLE IF NOT EXISTS resume_workspace (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      data JSON NOT NULL,
      revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  static get(userId: number): Promise<ResumeWorkspaceRow | null> {
    return queryOne<ResumeWorkspaceRow>('SELECT * FROM resume_workspace WHERE user_id = ?', [userId]);
  }

  static async save(userId: number, data: Record<string, any>, expectedRevision: number): Promise<WorkspaceSnapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<ResumeWorkspaceRow[]>(
          'SELECT * FROM resume_workspace WHERE user_id = ? FOR UPDATE', [userId]
        );
        const row = rows[0];
        const revision = row ? Number(row.revision) : 0;
        if (revision !== expectedRevision) {
          throw new WorkspaceConflictError({ revision, data: row ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null });
        }
        if (row) {
          await connection.execute('UPDATE resume_workspace SET data = ?, revision = revision + 1 WHERE user_id = ?', [JSON.stringify(data), userId]);
        } else {
          await connection.execute('INSERT INTO resume_workspace (user_id, data, revision) VALUES (?, ?, 1)', [userId, JSON.stringify(data)]);
        }
        await connection.commit();
        return { data, revision: revision + 1 };
      } catch (error) {
        await connection.rollback();
        const code = (error as { code?: string }).code;
        if (attempt < 2 && (code === 'ER_LOCK_DEADLOCK' || code === 'ER_DUP_ENTRY')) continue;
        throw error;
      } finally {
        connection.release();
      }
    }
    throw new Error('简历更新失败');
  }
}
