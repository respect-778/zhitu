import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, queryOne } from '../utils/db';

export interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password: string;
  email: string;
  avatar: string;
  mobile: string;
  gender: number;
  birthday: string;
  degree: string;
  art_count?: number;
  bio?: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserStats {
  art_count: number;
  follow_count: number;
  fans_count: number;
  like_count: number;
  comments_count: number;
  favorites_count: number;
}

export class UserModel {
  private static artCountColumnChecked = false;
  private static bioColumnChecked = false;

  private static async ensureArtCountColumn(): Promise<void> {
    if (UserModel.artCountColumnChecked) return;

    const row = await queryOne<{
      Field: string;
      Null: 'YES' | 'NO';
      Default: string | number | null;
    }>("SHOW COLUMNS FROM users LIKE 'art_count'");

    if (!row) {
      await query(
        "ALTER TABLE users ADD COLUMN art_count INT NOT NULL DEFAULT 0 COMMENT '原创文章数' AFTER degree"
      );
    } else if (row.Null !== 'NO' || row.Default === null) {
      await query('UPDATE users SET art_count = 0 WHERE art_count IS NULL');
      await query("ALTER TABLE users MODIFY COLUMN art_count INT NOT NULL DEFAULT 0 COMMENT '原创文章数'");
    }

    UserModel.artCountColumnChecked = true;
  }

  private static async ensureBioColumn(): Promise<void> {
    if (UserModel.bioColumnChecked) return;

    const row = await queryOne<{
      Field: string;
    }>("SHOW COLUMNS FROM users LIKE 'bio'");

    if (!row) {
      await query(
        "ALTER TABLE users ADD COLUMN bio VARCHAR(200) NOT NULL DEFAULT '' COMMENT '个性签名' AFTER art_count"
      );
    }

    UserModel.bioColumnChecked = true;
  }

  static async findByUsername(username: string): Promise<UserRow | null> {
    const sql = 'SELECT * FROM users WHERE username = ?';
    return queryOne<UserRow>(sql, [username]);
  }

  static async findById(id: number): Promise<UserRow | null> {
    const sql = 'SELECT * FROM users WHERE id = ?';
    return queryOne<UserRow>(sql, [id]);
  }

  static async findByEmail(email: string): Promise<UserRow | null> {
    const sql = 'SELECT * FROM users WHERE email = ?';
    return queryOne<UserRow>(sql, [email]);
  }

  static async createOAuthUser(data: {
    username: string;
    email?: string;
    avatar?: string;
  }): Promise<number> {
    await UserModel.ensureArtCountColumn();
    const sql = `
      INSERT INTO users (username, password, email, avatar, art_count)
      VALUES (?, '', ?, ?, 0)
    `;
    const result = await query<ResultSetHeader>(sql, [
      data.username,
      data.email || null,
      data.avatar || ''
    ]);
    return result.insertId;
  }

  static async create(userData: {
    username: string;
    email: string;
    password: string;
    mobile?: string;
    gender?: number;
    birthday?: string;
    degree?: string;
  }): Promise<number> {
    await UserModel.ensureArtCountColumn();

    const sql = `
      INSERT INTO users (username, email, password, mobile, gender, birthday, degree, art_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      userData.username,
      userData.email,
      userData.password,
      userData.mobile || '',
      userData.gender || 0,
      userData.birthday || null,
      userData.degree || '',
      0
    ];

    const result = await query<ResultSetHeader>(sql, params);
    return result.insertId;
  }

  static async update(id: number, userData: Partial<{
    username: string;
    mobile: string;
    gender: number;
    birthday: string | null;
    degree: string;
    avatar: string;
    bio: string;
  }>): Promise<boolean> {
    if (userData.bio !== undefined) {
      await UserModel.ensureBioColumn();
    }
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(userData).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return false;

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

    const result = await query<ResultSetHeader>(sql, values);
    return result.affectedRows > 0;
  }

  static async syncArtCount(userId: number, artCount?: number): Promise<number> {
    await UserModel.ensureArtCountColumn();

    let nextArtCount = artCount;

    if (!Number.isFinite(nextArtCount)) {
      const artCountSql = 'SELECT COUNT(*) as count FROM posts WHERE user_id = ?';
      const artResult = await queryOne<{ count: number }>(artCountSql, [userId]);
      nextArtCount = artResult?.count || 0;
    }

    const normalizedArtCount = Math.max(0, Math.floor(Number(nextArtCount) || 0));
    await query('UPDATE users SET art_count = ? WHERE id = ?', [normalizedArtCount, userId]);

    return normalizedArtCount;
  }

  static async getStats(userId: number): Promise<UserStats> {
    const art_count = await UserModel.syncArtCount(userId);

    const followCountSql = 'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?';
    const followResult = await queryOne<{ count: number }>(followCountSql, [userId]);
    const follow_count = followResult?.count || 0;

    const fansCountSql = 'SELECT COUNT(*) as count FROM follows WHERE following_id = ?';
    const fansResult = await queryOne<{ count: number }>(fansCountSql, [userId]);
    const fans_count = fansResult?.count || 0;

    const likeCountSql = `
      SELECT COALESCE(SUM(likes_count), 0) as total_likes
      FROM posts
      WHERE user_id = ?
    `;
    const likeResult = await queryOne<{ total_likes: number }>(likeCountSql, [userId]);
    const like_count = likeResult?.total_likes || 0;

    const commentsCountSql = 'SELECT COUNT(*) as count FROM comments WHERE user_id = ?';
    const commentsResult = await queryOne<{ count: number }>(commentsCountSql, [userId]);
    const comments_count = commentsResult?.count || 0;

    const favoritesCountSql = 'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?';
    const favoritesResult = await queryOne<{ count: number }>(favoritesCountSql, [userId]);
    const favorites_count = favoritesResult?.count || 0;

    return {
      art_count,
      follow_count,
      fans_count,
      like_count,
      comments_count,
      favorites_count
    };
  }
}
