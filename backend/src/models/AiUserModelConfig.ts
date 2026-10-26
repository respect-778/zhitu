import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, queryOne } from '../utils/db';

export interface AiUserModelConfigRow extends RowDataPacket {
  id: number;
  user_id: number;
  provider_name: string;
  base_url: string;
  api_key_encrypted: string;
  is_active: number | string;
  created_at: Date | null;
  updated_at: Date | null;
}

export class AiUserModelConfigModel {
  static async getActiveByUserId(userId: number): Promise<AiUserModelConfigRow | null> {
    const sql = `
      SELECT *
      FROM ai_user_model_config
      WHERE user_id = ?
        AND (
          is_active = 1
          OR LOWER(CAST(is_active AS CHAR)) IN ('1', 'true', 'yes')
        )
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `;
    return queryOne<AiUserModelConfigRow>(sql, [userId]);
  }

  static async getByUserIdAndProvider(
    userId: number,
    providerName: string
  ): Promise<AiUserModelConfigRow | null> {
    const sql = `
      SELECT *
      FROM ai_user_model_config
      WHERE user_id = ? AND provider_name = ?
      ORDER BY id DESC
      LIMIT 1
    `;
    return queryOne<AiUserModelConfigRow>(sql, [userId, providerName]);
  }

  static async deactivateAllByUserId(userId: number): Promise<void> {
    const sql = `
      UPDATE ai_user_model_config
      SET is_active = 0,
          updated_at = NOW()
      WHERE user_id = ?
    `;
    await query<ResultSetHeader>(sql, [userId]);
  }

  static async updateById(
    id: number,
    payload: {
      provider_name: string;
      base_url: string;
      api_key_encrypted: string;
      is_active: number;
    }
  ): Promise<boolean> {
    const sql = `
      UPDATE ai_user_model_config
      SET provider_name = ?,
          base_url = ?,
          api_key_encrypted = ?,
          is_active = ?,
          updated_at = NOW()
      WHERE id = ?
    `;
    const result = await query<ResultSetHeader>(sql, [
      payload.provider_name,
      payload.base_url,
      payload.api_key_encrypted,
      payload.is_active,
      id
    ]);
    return result.affectedRows > 0;
  }

  static async create(payload: {
    user_id: number;
    provider_name: string;
    base_url: string;
    api_key_encrypted: string;
    is_active: number;
  }): Promise<number> {
    const sql = `
      INSERT INTO ai_user_model_config
      (user_id, provider_name, base_url, api_key_encrypted, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const result = await query<ResultSetHeader>(sql, [
      payload.user_id,
      payload.provider_name,
      payload.base_url,
      payload.api_key_encrypted,
      payload.is_active
    ]);

    return result.insertId;
  }

  static async upsertActiveConfig(payload: {
    user_id: number;
    provider_name: string;
    base_url: string;
    api_key_encrypted: string;
  }): Promise<number> {
    await this.deactivateAllByUserId(payload.user_id);

    const existing = await this.getByUserIdAndProvider(payload.user_id, payload.provider_name);
    if (existing) {
      await this.updateById(existing.id, {
        provider_name: payload.provider_name,
        base_url: payload.base_url,
        api_key_encrypted: payload.api_key_encrypted,
        is_active: 1
      });
      return existing.id;
    }

    return this.create({
      ...payload,
      is_active: 1
    });
  }
}
