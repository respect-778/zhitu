import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, queryOne } from '../utils/db';
import pool from '../utils/db';

export interface GrowthWorkspaceRow extends RowDataPacket {
  id: number;
  user_id: number;
  data: string;
  revision: number;
  updated_at: Date;
}

export interface WorkspaceSnapshot {
  data: Record<string, any> | null;
  revision: number;
}

export class WorkspaceConflictError extends Error {
  constructor(public current: WorkspaceSnapshot) {
    super('工作区已在其他页面更新，本地修改已保留');
  }
}

export class GrowthWorkspaceModel {
  static async ensureSchema(): Promise<void> {
    const column = await queryOne<RowDataPacket>("SHOW COLUMNS FROM growth_workspace LIKE 'revision'");
    if (!column) {
      try {
        await query('ALTER TABLE growth_workspace ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER data');
      } catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
  }

  static async get(userId: number): Promise<GrowthWorkspaceRow | null> {
    return queryOne<GrowthWorkspaceRow>(
      'SELECT * FROM growth_workspace WHERE user_id = ?',
      [userId]
    );
  }

  static async mutate(
    userId: number,
    expectedRevision: number | null,
    update: (data: Record<string, any> | null) => Record<string, any>
  ): Promise<WorkspaceSnapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<GrowthWorkspaceRow[]>(
          'SELECT * FROM growth_workspace WHERE user_id = ? FOR UPDATE', [userId]
        );
        const row = rows[0];
        const revision = row ? Number(row.revision) : 0;
        const data = row ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null;
        if (expectedRevision !== null && expectedRevision !== revision) {
          throw new WorkspaceConflictError({ data, revision });
        }
        const nextData = update(data);
        if (row) {
          const [result] = await connection.execute<ResultSetHeader>(
            'UPDATE growth_workspace SET data = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?',
            [JSON.stringify(nextData), userId, revision]
          );
          if (result.affectedRows !== 1) throw new WorkspaceConflictError({ data, revision });
        } else {
          await connection.execute(
            'INSERT INTO growth_workspace (user_id, data, revision) VALUES (?, ?, 1)',
            [userId, JSON.stringify(nextData)]
          );
        }
        await connection.commit();
        return { data: nextData, revision: revision + 1 };
      } catch (error) {
        await connection.rollback();
        const code = (error as { code?: string }).code;
        if (attempt < 2 && (code === 'ER_LOCK_DEADLOCK' || code === 'ER_DUP_ENTRY')) continue;
        throw error;
      } finally {
        connection.release();
      }
    }
    throw new Error('工作区更新失败');
  }
}
