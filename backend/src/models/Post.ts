import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, queryOne } from '../utils/db';

export interface PostRow extends RowDataPacket {
  id: number;
  user_id: number;
  title: string;
  content: string;
  cover: string;
  abstract: string;
  keywords: string;
  photo: string;
  video: string;
  link: string;
  likes_count: number;
  comments_count: number;
  favorites_count: number;
  pageviews_count: number;
  created_at: Date;
  updated_at: Date;
  username?: string;
  avatar?: string;
  art_count?: number;
  fans_count?: number;
}

export class PostModel {
  private static pageviewsColumnChecked = false;
  private static coverColumnChecked = false;
  private static abstractColumnChecked = false;
  private static keywordsColumnChecked = false;

  private static async ensureCoverColumn(): Promise<void> {
    if (PostModel.coverColumnChecked) return;

    const row = await queryOne<{
      Field: string;
      Null: 'YES' | 'NO';
      Default: string | number | null;
    }>("SHOW COLUMNS FROM posts LIKE 'cover'");

    if (!row) {
      await query(
        "ALTER TABLE posts ADD COLUMN cover VARCHAR(500) DEFAULT '' COMMENT '封面URL' AFTER content"
      );
    }

    PostModel.coverColumnChecked = true;
  }

  private static async ensureAbstractColumn(): Promise<void> {
    if (PostModel.abstractColumnChecked) return;

    const row = await queryOne<{
      Field: string;
      Null: 'YES' | 'NO';
      Default: string | number | null;
    }>("SHOW COLUMNS FROM posts LIKE 'abstract'");

    if (!row) {
      await query(
        "ALTER TABLE posts ADD COLUMN `abstract` VARCHAR(300) DEFAULT '' COMMENT '文章摘要' AFTER cover"
      );
    }

    PostModel.abstractColumnChecked = true;
  }

  private static async ensureKeywordsColumn(): Promise<void> {
    if (PostModel.keywordsColumnChecked) return;

    const row = await queryOne<{
      Field: string;
      Null: 'YES' | 'NO';
      Default: string | number | null;
    }>("SHOW COLUMNS FROM posts LIKE 'keywords'");

    if (!row) {
      await query(
        "ALTER TABLE posts ADD COLUMN `keywords` VARCHAR(500) DEFAULT '' COMMENT '文章关键词JSON数组' AFTER `abstract`"
      );
    }

    PostModel.keywordsColumnChecked = true;
  }

  private static async ensurePageviewsColumn(): Promise<void> {
    if (PostModel.pageviewsColumnChecked) return;

    const row = await queryOne<{
      Field: string;
      Null: 'YES' | 'NO';
      Default: string | number | null;
    }>("SHOW COLUMNS FROM posts LIKE 'pageviews_count'");

    if (!row) {
      await query(
        "ALTER TABLE posts ADD COLUMN pageviews_count INT NOT NULL DEFAULT 0 COMMENT '浏览量' AFTER favorites_count"
      );
    } else if (row.Null !== 'NO' || row.Default === null) {
      // 兼容已存在但允许 NULL 的历史列定义
      await query('UPDATE posts SET pageviews_count = 0 WHERE pageviews_count IS NULL');
      await query("ALTER TABLE posts MODIFY COLUMN pageviews_count INT NOT NULL DEFAULT 0 COMMENT '浏览量'");
    }

    PostModel.pageviewsColumnChecked = true;
  }

  static async create(postData: {
    user_id: number;
    title?: string;
    content: string;
    cover?: string;
    abstract?: string;
    keywords?: string;
    photo?: string;
    video?: string;
    link?: string;
  }): Promise<number> {
    await PostModel.ensureCoverColumn();
    await PostModel.ensureAbstractColumn();
    await PostModel.ensureKeywordsColumn();

    const sql = [
      'INSERT INTO posts (user_id, title, content, cover, `abstract`, `keywords`, photo, video, link)',
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ].join('\n');
    const params = [
      postData.user_id,
      postData.title || '',
      postData.content,
      postData.cover || '',
      postData.abstract || '',
      postData.keywords || '',
      postData.photo || '',
      postData.video || '',
      postData.link || ''
    ];

    try {
      const result = await query<ResultSetHeader>(sql, params);
      return result.insertId;
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : '';
      const code = typeof error?.code === 'string' ? error.code : '';

      if (code === 'ER_BAD_FIELD_ERROR' && message.includes("Unknown column 'title'")) {
        await query(
          "ALTER TABLE posts ADD COLUMN title VARCHAR(200) DEFAULT '' COMMENT '帖子标题' AFTER user_id"
        );
        const result = await query<ResultSetHeader>(sql, params);
        return result.insertId;
      }

      throw error;
    }
  }

  static async findAll(): Promise<PostRow[]> {
    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `;
    return query<PostRow[]>(sql);
  }

  static async findForAbstractBackfill(options?: {
    force?: boolean;
    limit?: number;
  }): Promise<Array<Pick<PostRow, 'id' | 'title' | 'content' | 'abstract'>>> {
    await PostModel.ensureAbstractColumn();

    const params: Array<number> = [];
    let sql = `
      SELECT id, title, content, \`abstract\`
      FROM posts
    `;

    if (!options?.force) {
      sql += `
        WHERE COALESCE(TRIM(\`abstract\`), '') = ''
      `;
    }

    sql += `
      ORDER BY id ASC
    `;

    if (options?.limit && options.limit > 0) {
      sql += '\nLIMIT ?';
      params.push(Math.floor(options.limit));
    }

    return query<Array<Pick<PostRow, 'id' | 'title' | 'content' | 'abstract'>>>(sql, params);
  }

  static async findForKeywordsBackfill(options?: {
    force?: boolean;
    limit?: number;
  }): Promise<Array<Pick<PostRow, 'id' | 'title' | 'content' | 'keywords'>>> {
    await PostModel.ensureKeywordsColumn();

    const params: Array<number> = [];
    let sql = `
      SELECT id, title, content, \`keywords\`
      FROM posts
    `;

    if (!options?.force) {
      sql += `
        WHERE COALESCE(TRIM(\`keywords\`), '') = '' OR \`keywords\` = '[]'
      `;
    }

    sql += `
      ORDER BY id ASC
    `;

    if (options?.limit && options.limit > 0) {
      sql += '\nLIMIT ?';
      params.push(Math.floor(options.limit));
    }

    return query<Array<Pick<PostRow, 'id' | 'title' | 'content' | 'keywords'>>>(sql, params);
  }

  static async findPage(pageNum: number, pageSize: number): Promise<{ list: PostRow[]; total: number }> {
    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;

    const countSql = 'SELECT COUNT(*) as total FROM posts';
    const countResult = await queryOne<{ total: number }>(countSql);
    const total = countResult?.total || 0;

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<PostRow[]>(sql);
    return { list, total };
  }

  static async findWeeklyBest(
    pageNum: number,
    pageSize: number
  ): Promise<{ list: Array<PostRow & { week_start: string }>; total: number }> {
    await PostModel.ensurePageviewsColumn();

    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;

    // 每周最高综合分文章的数量（即有多少周有文章）
    const countSql = `
      SELECT COUNT(DISTINCT YEARWEEK(created_at, 1)) AS total FROM posts
    `;
    const countResult = await queryOne<{ total: number }>(countSql);
    const total = countResult?.total || 0;

    // 子查询：每周的最高综合分
    // 外层取每周综合分最高的那篇（同分取最新的）
    const sql = `
      SELECT ranked.*
      FROM (
        SELECT
          p.*,
          u.username,
          u.avatar,
          YEARWEEK(p.created_at, 1) AS yw,
          DATE_SUB(p.created_at, INTERVAL WEEKDAY(p.created_at) DAY) AS week_start,
          (p.likes_count + p.favorites_count + COALESCE(p.pageviews_count, 0)) AS score,
          ROW_NUMBER() OVER (
            PARTITION BY YEARWEEK(p.created_at, 1)
            ORDER BY (p.likes_count + p.favorites_count + COALESCE(p.pageviews_count, 0)) DESC, p.created_at DESC
          ) AS rn
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
      ) ranked
      WHERE ranked.rn = 1
      ORDER BY ranked.yw DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<Array<PostRow & { week_start: string }>>(sql);
    return { list, total };
  }

  static async findHotPage(pageNum: number, pageSize: number): Promise<{ list: PostRow[]; total: number }> {
    await PostModel.ensurePageviewsColumn();

    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;

    const countSql = 'SELECT COUNT(*) as total FROM posts';
    const countResult = await queryOne<{ total: number }>(countSql);
    const total = countResult?.total || 0;

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY (p.likes_count + p.favorites_count + COALESCE(p.pageviews_count, 0)) DESC, p.created_at DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<PostRow[]>(sql);
    return { list, total };
  }

  static async searchHotPage(
    keyword: string,
    pageNum: number,
    pageSize: number
  ): Promise<{ list: PostRow[]; total: number }> {
    await PostModel.ensurePageviewsColumn();

    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;
    const searchPattern = `%${keyword}%`;

    const countSql = `
      SELECT COUNT(*) as total
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.content LIKE ? OR u.username LIKE ?
    `;
    const countResult = await queryOne<{ total: number }>(countSql, [searchPattern, searchPattern]);
    const total = countResult?.total || 0;

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.content LIKE ? OR u.username LIKE ?
      ORDER BY (p.likes_count + p.favorites_count + COALESCE(p.pageviews_count, 0)) DESC, p.created_at DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<PostRow[]>(sql, [searchPattern, searchPattern]);
    return { list, total };
  }

  static async search(keyword: string): Promise<PostRow[]> {
    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.content LIKE ? OR u.username LIKE ?
      ORDER BY p.created_at DESC
    `;
    const searchPattern = `%${keyword}%`;
    return query<PostRow[]>(sql, [searchPattern, searchPattern]);
  }

  static async searchPage(
    keyword: string,
    pageNum: number,
    pageSize: number
  ): Promise<{ list: PostRow[]; total: number }> {
    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;
    const searchPattern = `%${keyword}%`;

    const countSql = `
      SELECT COUNT(*) as total
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.content LIKE ? OR u.username LIKE ?
    `;
    const countResult = await queryOne<{ total: number }>(countSql, [searchPattern, searchPattern]);
    const total = countResult?.total || 0;

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.content LIKE ? OR u.username LIKE ?
      ORDER BY p.created_at DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<PostRow[]>(sql, [searchPattern, searchPattern]);
    return { list, total };
  }

  static async findRecommendPage(pageNum: number, pageSize: number): Promise<{ list: PostRow[]; total: number }> {
    await PostModel.ensurePageviewsColumn();

    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;

    const countSql = 'SELECT COUNT(*) as total FROM posts';
    const countResult = await queryOne<{ total: number }>(countSql);
    const total = countResult?.total || 0;

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY (p.likes_count + p.favorites_count + COALESCE(p.pageviews_count, 0)) DESC, p.created_at DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<PostRow[]>(sql);
    return { list, total };
  }

  static async searchRecommendPage(
    keyword: string,
    pageNum: number,
    pageSize: number
  ): Promise<{ list: PostRow[]; total: number }> {
    await PostModel.ensurePageviewsColumn();

    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;
    const searchPattern = `%${keyword}%`;

    const countSql = `
      SELECT COUNT(*) as total
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.content LIKE ? OR u.username LIKE ?
    `;
    const countResult = await queryOne<{ total: number }>(countSql, [searchPattern, searchPattern]);
    const total = countResult?.total || 0;

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.content LIKE ? OR u.username LIKE ?
      ORDER BY (p.likes_count + p.favorites_count + COALESCE(p.pageviews_count, 0)) DESC, p.created_at DESC
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<PostRow[]>(sql, [searchPattern, searchPattern]);
    return { list, total };
  }

  static async findById(id: number): Promise<PostRow | null> {
    const sql = `
      SELECT
        p.*,
        u.username,
        u.avatar,
        (
          SELECT COUNT(*)
          FROM posts author_posts
          WHERE author_posts.user_id = p.user_id
        ) as art_count,
        (
          SELECT COUNT(*)
          FROM follows author_follows
          WHERE author_follows.following_id = p.user_id
        ) as fans_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `;
    return queryOne<PostRow>(sql, [id]);
  }

  static async findLatestDayFirst(): Promise<PostRow | null> {
    const latestDateRow = await queryOne<{ latestDate: string | null }>(
      "SELECT DATE_FORMAT(MAX(created_at), '%Y-%m-%d') as latestDate FROM posts"
    );

    if (!latestDateRow?.latestDate) return null;

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.created_at >= ?
        AND p.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT 1
    `;

    return queryOne<PostRow>(sql, [latestDateRow.latestDate, latestDateRow.latestDate]);
  }

  static async updateStats(
    postId: number,
    type: 'likes' | 'comments' | 'favorites',
    increment: boolean = true
  ): Promise<boolean> {
    const delta = increment ? 1 : -1;
    const sql = `UPDATE posts SET ${type}_count = GREATEST(0, ${type}_count + ?) WHERE id = ?`;
    const result = await query<ResultSetHeader>(sql, [delta, postId]);
    return result.affectedRows > 0;
  }

  static async incrementPageviews(postId: number): Promise<boolean> {
    await PostModel.ensurePageviewsColumn();

    const sql = 'UPDATE posts SET pageviews_count = COALESCE(pageviews_count, 0) + 1 WHERE id = ?';
    const result = await query<ResultSetHeader>(sql, [postId]);
    return result.affectedRows > 0;
  }

  static async updateKeywords(postId: number, keywords: string[]): Promise<boolean> {
    await PostModel.ensureKeywordsColumn();

    const sql = "UPDATE posts SET `keywords` = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    const result = await query<ResultSetHeader>(sql, [JSON.stringify(keywords), postId]);
    return result.affectedRows > 0;
  }

  static async updateAbstract(postId: number, abstract: string): Promise<boolean> {
    await PostModel.ensureAbstractColumn();

    const sql = "UPDATE posts SET `abstract` = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    const result = await query<ResultSetHeader>(sql, [abstract, postId]);
    return result.affectedRows > 0;
  }

  static async findByUserPage(
    userId: number,
    sort: 'hot' | 'new',
    pageNum: number,
    pageSize: number
  ): Promise<{ list: PostRow[]; total: number }> {
    await PostModel.ensurePageviewsColumn();

    const validPageNum = Math.max(1, Math.floor(pageNum));
    const validPageSize = Math.max(1, Math.floor(pageSize));
    const offset = (validPageNum - 1) * validPageSize;

    const countSql = 'SELECT COUNT(*) as total FROM posts WHERE user_id = ?';
    const countResult = await queryOne<{ total: number }>(countSql, [userId]);
    const total = countResult?.total || 0;

    const orderBy = sort === 'hot'
      ? '(p.likes_count + p.favorites_count + COALESCE(p.pageviews_count, 0)) DESC, p.created_at DESC'
      : 'p.created_at DESC';

    const sql = `
      SELECT p.*, u.username, u.avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY ${orderBy}
      LIMIT ${validPageSize} OFFSET ${offset}
    `;

    const list = await query<PostRow[]>(sql, [userId]);
    return { list, total };
  }

  static async delete(id: number): Promise<boolean> {
    const sql = 'DELETE FROM posts WHERE id = ?';
    const result = await query<ResultSetHeader>(sql, [id]);
    return result.affectedRows > 0;
  }
}
