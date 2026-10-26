import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, queryOne } from '../utils/db';

export interface OAuthAccountRow extends RowDataPacket {
  id: number;
  user_id: number;
  provider: string;
  provider_user_id: string;
  email: string;
  avatar_url: string;
  created_at: Date;
  updated_at: Date;
}

export class OAuthAccountModel {
  static async findByProviderUid(provider: string, providerUserId: string): Promise<OAuthAccountRow | null> {
    const sql = 'SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?';
    return queryOne<OAuthAccountRow>(sql, [provider, providerUserId]);
  }

  static async create(data: {
    userId: number;
    provider: string;
    providerUserId: string;
    email?: string;
    avatarUrl?: string;
  }): Promise<number> {
    const sql = `
      INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, avatar_url)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await query<ResultSetHeader>(sql, [
      data.userId,
      data.provider,
      data.providerUserId,
      data.email || '',
      data.avatarUrl || ''
    ]);
    return result.insertId;
  }
}
