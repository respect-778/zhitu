import type { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { CommentModel } from '../models/Comment';
import { FavoriteModel } from '../models/Favorite';
import { FollowModel } from '../models/Follow';
import { LikeModel } from '../models/Like';
import { PostModel, type PostRow } from '../models/Post';
import { UserModel } from '../models/User';
import { UserFolderModel } from '../models/UserFolder';
import { ReadingHistoryModel } from '../models/ReadingHistory';
import { generateArticleAbstract } from '../agents/articleAbstractAgent';
import { generateArticleKeywords } from '../agents/articleKeywordsAgent';
import { ResponseUtil } from '../utils/response';

const MAX_ABSTRACT_LENGTH = 256;
const MIN_ABSTRACT_SOURCE_LENGTH = 20;

const parseMediaField = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    const arr = value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0);
    return arr.length > 0 ? arr : undefined;
  }

  if (typeof value !== 'string') return undefined;

  const raw = value.trim();
  if (!raw) return undefined;

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const arr = parsed
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter((v) => v.length > 0);
        return arr.length > 0 ? arr : undefined;
      }
    } catch {
      return [raw];
    }
  }

  if (raw.includes(',')) {
    const arr = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }

  return [raw];
};

const toStorableMedia = (value: unknown): string => {
  const arr = parseMediaField(value);
  if (!arr) return '';
  return JSON.stringify(arr);
};

const parseOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const parseAbstractText = (value: unknown): string | undefined => {
  const text = parseOptionalText(value);
  if (!text) return undefined;
  return Array.from(text).slice(0, MAX_ABSTRACT_LENGTH).join('');
};

const parseKeywordsField = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string')
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .slice(0, 5);
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string => typeof v === 'string')
          .map(v => v.trim())
          .filter(v => v.length > 0)
          .slice(0, 5);
      }
    } catch {
      // not JSON
    }
  }

  return [];
};

const parseQueryBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
  }
  return null;
};

const parsePositiveId = (value: unknown): number => {
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return NaN;
  return parsed;
};

const getPageviews = (post: PostRow): number => {
  const value = Number(post.pageviews_count);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const getArtCount = (post: PostRow): number => {
  const value = Number(post.art_count);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const getFansCount = (post: PostRow): number => {
  const value = Number(post.fans_count);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const formatPost = (
  post: PostRow,
  options: {
    userId?: number;
    likedSet?: Set<number>;
    collectedSet?: Set<number>;
    isLiked?: boolean;
    isCollected?: boolean;
  }
) => {
  const { userId, likedSet, collectedSet, isLiked, isCollected } = options;

  const likedValue =
    typeof isLiked === 'boolean'
      ? isLiked
      : userId && likedSet
        ? likedSet.has(post.id)
        : false;

  const collectedValue =
    typeof isCollected === 'boolean'
      ? isCollected
      : userId && collectedSet
        ? collectedSet.has(post.id)
        : false;

  return {
    id: post.id,
    authorId: post.user_id,
    avatar: post.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
    name: post.username || '未知用户',
    time: new Date(post.created_at).toISOString(),
    title: post.title || '',
    content: post.content,
    cover: parseOptionalText(post.cover),
    abstract: parseAbstractText(post.abstract) || '',
    likes: post.likes_count,
    comments: post.comments_count,
    collection: post.favorites_count,
    Pageviews: getPageviews(post),
    isLiked: userId ? likedValue : false,
    isCollected: userId ? collectedValue : false,
    keywords: parseKeywordsField(post.keywords),
    photo: parseMediaField(post.photo),
    video: parseMediaField(post.video),
    link: parseMediaField(post.link)
  };
};

const resolveInteractionSets = async (userId: number | undefined, postIds: number[]) => {
  if (!userId || postIds.length === 0) {
    return {
      likedSet: new Set<number>(),
      collectedSet: new Set<number>()
    };
  }

  const [likedIds, collectedIds] = await Promise.all([
    LikeModel.findPostIdsByUserAndPostIds(userId, postIds),
    FavoriteModel.findPostIdsByUserAndPostIds(userId, postIds)
  ]);

  return {
    likedSet: new Set<number>(likedIds),
    collectedSet: new Set<number>(collectedIds)
  };
};

export class CommunityController {
  static async getList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const posts = await PostModel.findAll();
      const userId = req.userId;
      const postIds = posts.map((p) => p.id);
      const { likedSet, collectedSet } = await resolveInteractionSets(userId, postIds);

      const formattedPosts = posts.map((post) =>
        formatPost(post, {
          userId,
          likedSet,
          collectedSet
        })
      );

      res.json(ResponseUtil.success('获取成功', formattedPosts));
    } catch (error) {
      console.error('获取帖子列表错误:', error);
      res.status(500).json(ResponseUtil.error('获取帖子列表失败'));
    }
  }

  static async search(req: AuthRequest, res: Response): Promise<void> {
    try {
      const keyword = req.query.keyword as string | undefined;
      const pageNum = parsePositiveId(req.query.pageNum);
      const pageSize = parsePositiveId(req.query.pageSize);

      if (!Number.isFinite(pageNum) || !Number.isFinite(pageSize)) {
        res.status(400).json(ResponseUtil.error('pageNum和pageSize参数无效'));
        return;
      }

      const { list, total } = keyword && keyword.trim()
        ? await PostModel.searchRecommendPage(keyword.trim(), pageNum, pageSize)
        : await PostModel.findRecommendPage(pageNum, pageSize);

      const userId = req.userId;
      const postIds = list.map((p) => p.id);
      const { likedSet, collectedSet } = await resolveInteractionSets(userId, postIds);

      const formattedPosts = list.map((post) =>
        formatPost(post, {
          userId,
          likedSet,
          collectedSet
        })
      );

      res.json(
        ResponseUtil.success(keyword && keyword.trim() ? '搜索成功' : '获取成功', {
          list: formattedPosts,
          total,
          pageNum,
          pageSize
        })
      );
    } catch (error) {
      console.error('搜索帖子错误:', error);
      res.status(500).json(ResponseUtil.error('搜索失败'));
    }
  }

  static async getWeeklyDigest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const pageNum = parsePositiveId(req.query.pageNum);
      const pageSize = parsePositiveId(req.query.pageSize);

      if (!Number.isFinite(pageNum) || !Number.isFinite(pageSize)) {
        res.status(400).json(ResponseUtil.error('pageNum和pageSize参数无效'));
        return;
      }

      const { list, total } = await PostModel.findWeeklyBest(pageNum, pageSize);

      // 期号：total 为总周数，第一页第一条 = 最新一周 = 第 total 期
      // 当前页的起始期号 = total - offset
      const offset = (Math.max(1, Math.floor(pageNum)) - 1) * Math.max(1, Math.floor(pageSize));

      const weeklyItems = list.map((post, index) => {
        const issueNumber = total - offset - index;
        const weekStart = new Date(post.week_start);
        const date = new Date(post.created_at);
        const dateStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        return {
          issueNumber,
          postId: post.id,
          title: post.title || '',
          abstract: parseAbstractText(post.abstract) || '',
          author: post.username || '未知用户',
          avatar: post.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
          date: dateStr,
          weekStart: weekStart.toISOString().slice(0, 10),
          likes: post.likes_count,
          collection: post.favorites_count,
          pageviews: getPageviews(post),
        };
      });

      res.json(
        ResponseUtil.success('获取成功', {
          list: weeklyItems,
          total,
          pageNum,
          pageSize
        })
      );
    } catch (error) {
      console.error('获取精选周刊错误:', error);
      res.status(500).json(ResponseUtil.error('获取精选周刊失败'));
    }
  }

  static async getHotList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const keyword = req.query.keyword as string | undefined;
      const pageNum = parsePositiveId(req.query.pageNum);
      const pageSize = parsePositiveId(req.query.pageSize);

      if (!Number.isFinite(pageNum) || !Number.isFinite(pageSize)) {
        res.status(400).json(ResponseUtil.error('pageNum和pageSize参数无效'));
        return;
      }

      const { list, total } = keyword && keyword.trim()
        ? await PostModel.searchHotPage(keyword.trim(), pageNum, pageSize)
        : await PostModel.findHotPage(pageNum, pageSize);

      const userId = req.userId;
      const postIds = list.map((p) => p.id);
      const { likedSet, collectedSet } = await resolveInteractionSets(userId, postIds);

      const formattedPosts = list.map((post) =>
        formatPost(post, {
          userId,
          likedSet,
          collectedSet
        })
      );

      res.json(
        ResponseUtil.success('获取成功', {
          list: formattedPosts,
          total,
          pageNum,
          pageSize
        })
      );
    } catch (error) {
      console.error('获取热门帖子错误:', error);
      res.status(500).json(ResponseUtil.error('获取热门帖子失败'));
    }
  }

  static async getNewList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const keyword = req.query.keyword as string | undefined;
      const pageNum = parsePositiveId(req.query.pageNum);
      const pageSize = parsePositiveId(req.query.pageSize);

      if (!Number.isFinite(pageNum) || !Number.isFinite(pageSize)) {
        res.status(400).json(ResponseUtil.error('pageNum和pageSize参数无效'));
        return;
      }

      const { list, total } = keyword && keyword.trim()
        ? await PostModel.searchPage(keyword.trim(), pageNum, pageSize)
        : await PostModel.findPage(pageNum, pageSize);

      const userId = req.userId;
      const postIds = list.map((p) => p.id);
      const { likedSet, collectedSet } = await resolveInteractionSets(userId, postIds);

      const formattedPosts = list.map((post) =>
        formatPost(post, {
          userId,
          likedSet,
          collectedSet
        })
      );

      res.json(
        ResponseUtil.success('获取成功', {
          list: formattedPosts,
          total,
          pageNum,
          pageSize
        })
      );
    } catch (error) {
      console.error('获取最新帖子错误:', error);
      res.status(500).json(ResponseUtil.error('获取最新帖子失败'));
    }
  }

  static async getEarlyReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const post = await PostModel.findLatestDayFirst();
      if (!post) {
        res.json(ResponseUtil.success('暂无早报', null));
        return;
      }

      const userId = req.userId;
      const [isLiked, isCollected] = userId
        ? await Promise.all([
          LikeModel.exists(post.id, userId),
          FavoriteModel.exists(post.id, userId)
        ])
        : [false, false];

      res.json(
        ResponseUtil.success('获取成功', formatPost(post, {
          userId,
          isLiked,
          isCollected
        }))
      );
    } catch (error) {
      console.error('获取早报错误:', error);
      res.status(500).json(ResponseUtil.error('获取早报失败'));
    }
  }

  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const postId = parsePositiveId(req.params.id);
      if (!Number.isFinite(postId)) {
        res.status(400).json(ResponseUtil.error('帖子ID无效'));
        return;
      }

      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json(ResponseUtil.error('帖子不存在'));
        return;
      }

      const userId = req.userId;
      const [isLiked, isCollected, isFollowed] = userId
        ? await Promise.all([
          LikeModel.exists(postId, userId),
          FavoriteModel.exists(postId, userId),
          userId === post.user_id ? Promise.resolve(false) : FollowModel.exists(userId, post.user_id)
        ])
        : [false, false, false];
      const artCount = await UserModel.syncArtCount(post.user_id, getArtCount(post));
      const fansCount = getFansCount(post);

      // 记录阅读历史（异步，不阻塞响应）
      if (userId) {
        ReadingHistoryModel.upsert(userId, postId).catch(err =>
          console.error('记录阅读历史失败:', err)
        );
      }

      res.json(
        ResponseUtil.success('获取成功', {
          ...formatPost(post, {
            userId,
            isLiked,
            isCollected
          }),
          art_count: artCount,
          fans_count: fansCount,
          isFollowed
        })
      );
    } catch (error) {
      console.error('获取帖子详情错误:', error);
      res.status(500).json(ResponseUtil.error('获取帖子详情失败'));
    }
  }

  static async pageviewsByQuery(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未登录，无法记录浏览量'));
        return;
      }

      const articleId = req.pageviewsContext?.articleId ?? parsePositiveId(req.query.articleId ?? req.query.id);
      if (!Number.isFinite(articleId)) {
        res.status(400).json(ResponseUtil.error('文章ID无效'));
        return;
      }

      const post = await PostModel.findById(articleId);
      if (!post) {
        res.status(404).json(ResponseUtil.error('帖子不存在'));
        return;
      }

      const shouldIncrease = req.pageviewsContext?.shouldIncrease ?? true;
      if (!shouldIncrease) {
        res.json(
          ResponseUtil.success('12小时内已记录过浏览', {
            id: articleId,
            pageviewsDelta: 0,
            counted: false,
            Pageviews: getPageviews(post)
          })
        );
        return;
      }

      const incremented = await PostModel.incrementPageviews(articleId);
      if (!incremented) {
        res.status(500).json(
          ResponseUtil.error('浏览量写入失败，请检查数据库连接和文章ID是否一致')
        );
        return;
      }

      const latest = await PostModel.findById(articleId);
      const latestPageviews = latest ? getPageviews(latest) : getPageviews(post) + 1;

      res.json(
        ResponseUtil.success('浏览量记录成功', {
          id: articleId,
          pageviewsDelta: 1,
          counted: true,
          Pageviews: latestPageviews
        })
      );
    } catch (error) {
      console.error('记录浏览量错误:', error);
      res.status(500).json(ResponseUtil.error('记录浏览量失败'));
    }
  }

  static async createPost(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const { title, content, cover, photo, video, link } = req.body;
      const abstract = parseAbstractText(req.body?.abstract);
      const keywords = parseKeywordsField(req.body?.keywords);

      if (!content || content.trim() === '') {
        res.status(400).json(ResponseUtil.error('帖子内容不能为空'));
        return;
      }

      if (!title || typeof title !== 'string' || title.trim() === '') {
        res.status(400).json(ResponseUtil.error('帖子标题不能为空'));
        return;
      }

      const postId = await PostModel.create({
        user_id: userId,
        title: title.trim(),
        content: content.trim(),
        cover: parseOptionalText(cover),
        abstract,
        keywords: keywords.length > 0 ? JSON.stringify(keywords) : '',
        photo: toStorableMedia(photo),
        video: toStorableMedia(video),
        link: toStorableMedia(link)
      });
      const artCount = await UserModel.syncArtCount(userId);

      res.status(201).json(ResponseUtil.success('发布成功', { id: postId, art_count: artCount }));
    } catch (error) {
      console.error('创建帖子错误:', error);
      res.status(500).json(ResponseUtil.error('发布失败'));
    }
  }

  static async addPost(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const body = req.body as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const abstract = parseAbstractText(body.abstract);
      const keywords = parseKeywordsField(body.keywords);

      if (!title) {
        res.status(400).json(ResponseUtil.error('帖子标题不能为空'));
        return;
      }

      if (!content) {
        res.status(400).json(ResponseUtil.error('帖子内容不能为空'));
        return;
      }

      const postId = await PostModel.create({
        user_id: userId,
        title,
        content,
        cover: parseOptionalText(body.cover),
        abstract,
        keywords: keywords.length > 0 ? JSON.stringify(keywords) : '',
        photo: toStorableMedia(body.photo),
        video: toStorableMedia(body.video),
        link: toStorableMedia(body.link)
      });
      const artCount = await UserModel.syncArtCount(userId);

      res.status(201).json(ResponseUtil.success('发布成功', { id: postId, art_count: artCount }));
    } catch (error) {
      console.error('发布帖子错误:', error);
      res.status(500).json(ResponseUtil.error('发布失败'));
    }
  }

  static async generateKeywords(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const body = req.body as { title?: unknown; content?: unknown };
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const content = typeof body.content === 'string' ? body.content.trim() : '';

      if (!content) {
        res.status(400).json(ResponseUtil.error('文章内容不能为空'));
        return;
      }

      if (Array.from(content).length < MIN_ABSTRACT_SOURCE_LENGTH) {
        res.status(400).json(ResponseUtil.error(`文章内容至少需要 ${MIN_ABSTRACT_SOURCE_LENGTH} 个字`));
        return;
      }

      const keywords = await generateArticleKeywords({ title, content });
      res.json(ResponseUtil.success('关键词提取成功', { keywords }));
    } catch (error) {
      console.error('生成文章关键词错误:', error);
      res.status(500).json(ResponseUtil.error('关键词提取失败'));
    }
  }

  static async generateAbstract(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const body = req.body as { title?: unknown; content?: unknown };
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const content = typeof body.content === 'string' ? body.content.trim() : '';

      if (!content) {
        res.status(400).json(ResponseUtil.error('文章内容不能为空'));
        return;
      }

      if (Array.from(content).length < MIN_ABSTRACT_SOURCE_LENGTH) {
        res.status(400).json(ResponseUtil.error(`文章内容至少需要 ${MIN_ABSTRACT_SOURCE_LENGTH} 个字`));
        return;
      }

      const abstract = await generateArticleAbstract({ title, content });
      res.json(ResponseUtil.success('摘要生成成功', { abstract }));
    } catch (error) {
      console.error('生成文章摘要错误:', error);
      res.status(500).json(ResponseUtil.error('摘要生成失败'));
    }
  }

  static async likePost(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const postId = parsePositiveId(req.params.id);
      if (!Number.isFinite(postId)) {
        res.status(400).json(ResponseUtil.error('帖子ID无效'));
        return;
      }

      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json(ResponseUtil.error('帖子不存在'));
        return;
      }

      const alreadyLiked = await LikeModel.exists(postId, userId);

      if (alreadyLiked) {
        await LikeModel.delete(postId, userId);
        await PostModel.updateStats(postId, 'likes', false);
        res.json(ResponseUtil.success('取消点赞成功'));
        return;
      }

      await LikeModel.create(postId, userId);
      await PostModel.updateStats(postId, 'likes', true);
      res.json(ResponseUtil.success('点赞成功'));
    } catch (error) {
      console.error('点赞错误:', error);
      res.status(500).json(ResponseUtil.error('操作失败'));
    }
  }

  static async likeByQuery(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const postId = parsePositiveId(req.query.id);
      if (!Number.isFinite(postId)) {
        res.status(400).json(ResponseUtil.error('帖子ID无效'));
        return;
      }

      const isLiked = parseQueryBoolean(req.query.isLiked);
      if (isLiked === null) {
        res.status(400).json(ResponseUtil.error('isLiked 参数无效'));
        return;
      }

      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json(ResponseUtil.error('帖子不存在'));
        return;
      }

      const shouldLike = isLiked === false;
      let likesDelta = 0;

      if (shouldLike) {
        const created = await LikeModel.create(postId, userId);
        if (created) {
          await PostModel.updateStats(postId, 'likes', true);
          likesDelta = 1;
        }
      } else {
        const deleted = await LikeModel.delete(postId, userId);
        if (deleted) {
          await PostModel.updateStats(postId, 'likes', false);
          likesDelta = -1;
        }
      }

      res.json(ResponseUtil.success('操作成功', { id: postId, likesDelta, isLiked: shouldLike }));
    } catch (error) {
      console.error('点赞操作错误:', error);
      res.status(500).json(ResponseUtil.error('操作失败'));
    }
  }

  static async favoritePost(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const postId = parsePositiveId(req.params.id);
      if (!Number.isFinite(postId)) {
        res.status(400).json(ResponseUtil.error('帖子ID无效'));
        return;
      }

      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json(ResponseUtil.error('帖子不存在'));
        return;
      }

      const alreadyFavorited = await FavoriteModel.exists(postId, userId);

      if (alreadyFavorited) {
        await FavoriteModel.delete(postId, userId);
        await PostModel.updateStats(postId, 'favorites', false);
        res.json(ResponseUtil.success('取消收藏成功'));
        return;
      }

      await FavoriteModel.create(postId, userId);
      await PostModel.updateStats(postId, 'favorites', true);
      res.json(ResponseUtil.success('收藏成功'));
    } catch (error) {
      console.error('收藏错误:', error);
      res.status(500).json(ResponseUtil.error('操作失败'));
    }
  }

  static async collectedByQuery(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const postId = parsePositiveId(req.query.id);
      if (!Number.isFinite(postId)) {
        res.status(400).json(ResponseUtil.error('帖子ID无效'));
        return;
      }

      const raw = (req.query.isCollected ?? req.query.isLiked) as unknown;
      const isCollected = parseQueryBoolean(raw);
      if (isCollected === null) {
        res.status(400).json(ResponseUtil.error('isCollected 参数无效'));
        return;
      }

      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json(ResponseUtil.error('帖子不存在'));
        return;
      }

      const shouldCollect = isCollected === false;
      let collectionDelta = 0;

      if (shouldCollect) {
        const created = await FavoriteModel.create(postId, userId);
        if (created) {
          await PostModel.updateStats(postId, 'favorites', true);
          collectionDelta = 1;
        }
      } else {
        const deleted = await FavoriteModel.delete(postId, userId);
        if (deleted) {
          await PostModel.updateStats(postId, 'favorites', false);
          collectionDelta = -1;
        }
      }

      res.json(
        ResponseUtil.success('操作成功', { id: postId, collectionDelta, isCollected: shouldCollect })
      );
    } catch (error) {
      console.error('收藏操作错误:', error);
      res.status(500).json(ResponseUtil.error('操作失败'));
    }
  }

  static async followAuthor(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const body = req.body as { authorId?: unknown; action?: unknown; targetUserId?: unknown };
      const authorId = parsePositiveId(body.authorId ?? body.targetUserId);
      if (!Number.isFinite(authorId)) {
        res.status(400).json(ResponseUtil.error('作者ID无效'));
        return;
      }

      if (authorId === userId) {
        res.status(400).json(ResponseUtil.error('不能关注自己'));
        return;
      }

      const action = typeof body.action === 'string' ? body.action.trim() : '';
      if (action !== 'follow' && action !== 'unfollow') {
        res.status(400).json(ResponseUtil.error('action 参数无效'));
        return;
      }

      const author = await UserModel.findById(authorId);
      if (!author) {
        res.status(404).json(ResponseUtil.error('作者不存在'));
        return;
      }

      let message = '';

      if (action === 'follow') {
        const created = await FollowModel.create(userId, authorId);
        message = created ? '关注成功' : '已关注该作者';
      } else {
        const deleted = await FollowModel.delete(userId, authorId);
        message = deleted ? '取消关注成功' : '当前未关注该作者';
      }

      const fansCount = await FollowModel.countFollowers(authorId);

      res.json(
        ResponseUtil.success(message, {
          authorId,
          isFollowed: action === 'follow',
          fans_count: fansCount
        })
      );
    } catch (error) {
      console.error('关注作者错误:', error);
      res.status(500).json(ResponseUtil.error('关注操作失败'));
    }
  }

  static async commentPost(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const postId = parsePositiveId(req.params.id);
      if (!Number.isFinite(postId)) {
        res.status(400).json(ResponseUtil.error('帖子ID无效'));
        return;
      }

      const { content } = req.body as { content?: string };
      if (!content || content.trim() === '') {
        res.status(400).json(ResponseUtil.error('评论内容不能为空'));
        return;
      }

      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json(ResponseUtil.error('帖子不存在'));
        return;
      }

      const commentId = await CommentModel.create({
        post_id: postId,
        user_id: userId,
        content: content.trim()
      });

      await PostModel.updateStats(postId, 'comments', true);
      res.status(201).json(ResponseUtil.success('评论成功', { id: commentId }));
    } catch (error) {
      console.error('评论错误:', error);
      res.status(500).json(ResponseUtil.error('评论失败'));
    }
  }

  static async getComments(req: Request, res: Response): Promise<void> {
    try {
      const postId = parsePositiveId(req.params.id);
      if (!Number.isFinite(postId)) {
        res.status(400).json(ResponseUtil.error('帖子ID无效'));
        return;
      }

      const comments = await CommentModel.findByPostId(postId);
      const formattedComments = comments.map((comment) => ({
        id: comment.id,
        userId: comment.user_id,
        username: comment.username || '未知用户',
        avatar: comment.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
        content: comment.content,
        time: new Date(comment.created_at).toISOString()
      }));

      res.json(ResponseUtil.success('获取成功', formattedComments));
    } catch (error) {
      console.error('获取评论错误:', error);
      res.status(500).json(ResponseUtil.error('获取评论失败'));
    }
  }

  static async uploadImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (files.length === 0) {
        res.status(400).json(ResponseUtil.error('请至少上传一张图片'));
        return;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const items = files.map((file) => {
        const url = `${baseUrl}/uploads/community/images/${encodeURIComponent(file.filename)}`;
        return {
          url,
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype
        };
      });

      res.json(
        ResponseUtil.success('上传成功', {
          urls: items.map((item) => item.url),
          files: items
        })
      );
    } catch (error) {
      console.error('上传图片错误:', error);
      res.status(500).json(ResponseUtil.error('上传失败'));
    }
  }

  // ==================== 关注列表相关 ====================

  static async getFollowingList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const followingIds = await FollowModel.getFollowing(userId);
      if (followingIds.length === 0) {
        res.json(ResponseUtil.success('获取成功', []));
        return;
      }

      // 批量查询关注用户的详细信息
      const placeholders = followingIds.map(() => '?').join(',');
      const sql = `
        SELECT
          u.id,
          u.username,
          u.avatar,
          COALESCE(u.art_count, 0) AS art_count,
          (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS fans_count
        FROM users u
        WHERE u.id IN (${placeholders})
        ORDER BY (SELECT created_at FROM follows WHERE follower_id = ? AND following_id = u.id) DESC
      `;

      const rows = await import('../utils/db').then(db =>
        db.query<Array<{
          id: number;
          username: string;
          avatar: string;
          art_count: number;
          fans_count: number;
        }>>(sql, [...followingIds, userId])
      );

      const list = rows.map(row => ({
        id: row.id,
        username: row.username || '未知用户',
        avatar: row.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
        art_count: Number(row.art_count) || 0,
        fans_count: Number(row.fans_count) || 0,
      }));

      res.json(ResponseUtil.success('获取成功', list));
    } catch (error) {
      console.error('获取关注列表错误:', error);
      res.status(500).json(ResponseUtil.error('获取关注列表失败'));
    }
  }

  // ==================== 用户文章列表 ====================

  static async getUserPosts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const targetUserId = parsePositiveId(req.params.id);
      if (!Number.isFinite(targetUserId)) {
        res.status(400).json(ResponseUtil.error('无效的用户 ID'));
        return;
      }

      const sort = (req.query.sort as string) === 'new' ? 'new' : 'hot';
      const pageNum = parsePositiveId(req.query.pageNum) || 1;
      const pageSize = parsePositiveId(req.query.pageSize) || 10;

      const { list, total } = await PostModel.findByUserPage(targetUserId, sort, pageNum, pageSize);

      const userId = req.userId;
      const postIds = list.map((p) => p.id);
      const { likedSet, collectedSet } = await resolveInteractionSets(userId, postIds);

      const formattedPosts = list.map((post) =>
        formatPost(post, { userId, likedSet, collectedSet })
      );

      res.json(ResponseUtil.success('获取成功', {
        list: formattedPosts,
        total,
        pageNum,
        pageSize
      }));
    } catch (error) {
      console.error('获取用户文章列表错误:', error);
      res.status(500).json(ResponseUtil.error('获取用户文章列表失败'));
    }
  }

  // ==================== 文件夹相关 ====================

  static async createFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const { name, color, type } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json(ResponseUtil.error('文件夹名称不能为空'));
        return;
      }
      if (!['collection', 'history'].includes(type)) {
        res.status(400).json(ResponseUtil.error('type 参数无效'));
        return;
      }

      const id = await UserFolderModel.create(userId, name.trim(), color || '#3b82f6', type);
      res.json(ResponseUtil.success('创建成功', { id, name: name.trim(), color: color || '#3b82f6', type }));
    } catch (error) {
      console.error('创建文件夹错误:', error);
      res.status(500).json(ResponseUtil.error('创建文件夹失败'));
    }
  }

  static async getFolders(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const type = req.query.type as string;
      if (!['collection', 'history'].includes(type)) {
        res.status(400).json(ResponseUtil.error('type 参数无效'));
        return;
      }

      const folders = await UserFolderModel.findByUser(userId, type as 'collection' | 'history');
      res.json(ResponseUtil.success('获取成功', folders));
    } catch (error) {
      console.error('获取文件夹错误:', error);
      res.status(500).json(ResponseUtil.error('获取文件夹失败'));
    }
  }

  static async deleteFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const folderId = parsePositiveId(req.params.id);
      if (!Number.isFinite(folderId)) {
        res.status(400).json(ResponseUtil.error('文件夹ID无效'));
        return;
      }

      const deleted = await UserFolderModel.delete(folderId, userId);
      if (!deleted) {
        res.status(404).json(ResponseUtil.error('文件夹不存在'));
        return;
      }
      res.json(ResponseUtil.success('删除成功'));
    } catch (error) {
      console.error('删除文件夹错误:', error);
      res.status(500).json(ResponseUtil.error('删除文件夹失败'));
    }
  }

  static async renameFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const folderId = parsePositiveId(req.params.id);
      if (!Number.isFinite(folderId)) {
        res.status(400).json(ResponseUtil.error('文件夹ID无效'));
        return;
      }

      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json(ResponseUtil.error('文件夹名称不能为空'));
        return;
      }

      const updated = await UserFolderModel.rename(folderId, userId, name.trim());
      if (!updated) {
        res.status(404).json(ResponseUtil.error('文件夹不存在'));
        return;
      }
      res.json(ResponseUtil.success('重命名成功'));
    } catch (error) {
      console.error('重命名文件夹错误:', error);
      res.status(500).json(ResponseUtil.error('重命名文件夹失败'));
    }
  }

  // ==================== 阅读历史相关 ====================

  static async getReadingHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const folderId = req.query.folder_id ? parseInt(req.query.folder_id as string) : undefined;
      const keyword = (req.query.keyword as string) || '';
      const sort = (req.query.sort as string) === 'oldest' ? 'oldest' : 'newest';
      const date = (req.query.date as string) || undefined;

      const { list, total } = await ReadingHistoryModel.findPage(userId, { page, pageSize, folderId, keyword: keyword || undefined, sort, date });
      const count = await ReadingHistoryModel.getCount(userId);

      res.json(ResponseUtil.success('获取成功', { list, total, count }));
    } catch (error) {
      console.error('获取阅读历史错误:', error);
      res.status(500).json(ResponseUtil.error('获取阅读历史失败'));
    }
  }

  static async deleteHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const id = parsePositiveId(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json(ResponseUtil.error('记录ID无效'));
        return;
      }

      const deleted = await ReadingHistoryModel.delete(id, userId);
      if (!deleted) {
        res.status(404).json(ResponseUtil.error('记录不存在'));
        return;
      }
      res.json(ResponseUtil.success('删除成功'));
    } catch (error) {
      console.error('删除阅读历史错误:', error);
      res.status(500).json(ResponseUtil.error('删除失败'));
    }
  }

  static async moveHistoryToFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const id = parsePositiveId(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json(ResponseUtil.error('记录ID无效'));
        return;
      }

      const { folder_id } = req.body;
      const updated = await ReadingHistoryModel.moveToFolder(id, userId, folder_id ?? null);
      if (!updated) {
        res.status(404).json(ResponseUtil.error('记录不存在'));
        return;
      }
      res.json(ResponseUtil.success('移动成功'));
    } catch (error) {
      console.error('移动到文件夹错误:', error);
      res.status(500).json(ResponseUtil.error('操作失败'));
    }
  }

  // ==================== 收藏列表相关 ====================

  static async getCollectionList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const folderId = req.query.folder_id ? parseInt(req.query.folder_id as string) : undefined;
      const keyword = (req.query.keyword as string) || '';
      const sort = (req.query.sort as string) === 'oldest' ? 'oldest' : 'newest';
      const date = (req.query.date as string) || undefined;

      const { list, total } = await FavoriteModel.findPage(userId, { page, pageSize, folderId, keyword: keyword || undefined, sort, date });
      const count = await FavoriteModel.getCount(userId);

      res.json(ResponseUtil.success('获取成功', { list, total, count }));
    } catch (error) {
      console.error('获取收藏列表错误:', error);
      res.status(500).json(ResponseUtil.error('获取收藏列表失败'));
    }
  }

  static async deleteCollection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const id = parsePositiveId(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json(ResponseUtil.error('记录ID无效'));
        return;
      }

      const deleted = await FavoriteModel.deleteById(id, userId);
      if (!deleted) {
        res.status(404).json(ResponseUtil.error('记录不存在'));
        return;
      }
      res.json(ResponseUtil.success('删除成功'));
    } catch (error) {
      console.error('删除收藏错误:', error);
      res.status(500).json(ResponseUtil.error('删除失败'));
    }
  }

  static async moveCollectionToFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) { res.status(401).json(ResponseUtil.error('未授权')); return; }

      const id = parsePositiveId(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json(ResponseUtil.error('记录ID无效'));
        return;
      }

      const { folder_id } = req.body;
      const updated = await FavoriteModel.moveToFolder(id, userId, folder_id ?? null);
      if (!updated) {
        res.status(404).json(ResponseUtil.error('记录不存在'));
        return;
      }
      res.json(ResponseUtil.success('移动成功'));
    } catch (error) {
      console.error('移动收藏到文件夹错误:', error);
      res.status(500).json(ResponseUtil.error('操作失败'));
    }
  }
}
