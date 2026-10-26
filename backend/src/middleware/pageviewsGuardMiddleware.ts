import type { NextFunction, Response } from 'express';
import dotenv from 'dotenv';
import type { AuthRequest } from './authMiddleware';
import { ResponseUtil } from '../utils/response';
import { incrWithExpire, setNxWithExpire } from '../utils/redis';

dotenv.config();

const ONE_MINUTE_SECONDS = 60;
const TWELVE_HOURS_SECONDS = 12 * 60 * 60;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const RATE_LIMIT_WINDOW_SECONDS = parsePositiveInt(
  process.env.PAGEVIEWS_RATE_LIMIT_WINDOW_SECONDS,
  ONE_MINUTE_SECONDS
);
const RATE_LIMIT_MAX = parsePositiveInt(process.env.PAGEVIEWS_RATE_LIMIT_MAX, 100);
const DEDUPE_WINDOW_SECONDS = parsePositiveInt(process.env.PAGEVIEWS_DEDUPE_WINDOW_SECONDS, TWELVE_HOURS_SECONDS);

const fallbackRateStore = new Map<string, { count: number; expireAt: number }>();
const fallbackDedupeStore = new Map<string, number>();
let fallbackSweepStarted = false;

const cleanupFallbackStores = () => {
  const now = Date.now();

  for (const [key, value] of fallbackRateStore.entries()) {
    if (value.expireAt <= now) {
      fallbackRateStore.delete(key);
    }
  }

  for (const [key, expireAt] of fallbackDedupeStore.entries()) {
    if (expireAt <= now) {
      fallbackDedupeStore.delete(key);
    }
  }
};

const ensureFallbackSweeper = () => {
  if (fallbackSweepStarted) return;
  fallbackSweepStarted = true;
  setInterval(cleanupFallbackStores, 5 * ONE_MINUTE_SECONDS * 1000).unref();
};

const incrementFallbackRate = (key: string, windowSeconds: number): number => {
  const now = Date.now();
  const current = fallbackRateStore.get(key);
  if (!current || current.expireAt <= now) {
    fallbackRateStore.set(key, {
      count: 1,
      expireAt: now + windowSeconds * 1000
    });
    return 1;
  }

  const nextCount = current.count + 1;
  fallbackRateStore.set(key, {
    count: nextCount,
    expireAt: current.expireAt
  });
  return nextCount;
};

const checkAndSetFallbackDedupe = (key: string, windowSeconds: number): boolean => {
  const now = Date.now();
  const expireAt = fallbackDedupeStore.get(key);
  if (expireAt && expireAt > now) {
    return false;
  }

  fallbackDedupeStore.set(key, now + windowSeconds * 1000);
  return true;
};

const parseArticleId = (req: AuthRequest): number => {
  const raw = req.query.articleId ?? req.query.id ?? req.params.id;
  if (typeof raw !== 'string' && typeof raw !== 'number') return NaN;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const pageviewsGuardMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  ensureFallbackSweeper();

  const userId = req.userId;
  if (!userId) {
    res.status(401).json(ResponseUtil.error('未登录，无法记录浏览量'));
    return;
  }

  const articleId = parseArticleId(req);
  if (!Number.isFinite(articleId) || articleId <= 0) {
    res.status(400).json(ResponseUtil.error('文章ID无效'));
    return;
  }

  const rateLimitKey = `pv:rate:user:${userId}`;
  const dedupeKey = `pv:dedupe:post:${articleId}:user:${userId}`;

  const redisRateCount = await incrWithExpire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
  const rateCount =
    redisRateCount === null
      ? incrementFallbackRate(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS)
      : redisRateCount;

  if (rateCount > RATE_LIMIT_MAX) {
    res.status(429).json(
      ResponseUtil.error(`请求过于频繁：${RATE_LIMIT_WINDOW_SECONDS}秒内最多允许${RATE_LIMIT_MAX}次`)
    );
    return;
  }

  const redisShouldIncrease = await setNxWithExpire(dedupeKey, DEDUPE_WINDOW_SECONDS);
  const shouldIncrease =
    redisShouldIncrease === null
      ? checkAndSetFallbackDedupe(dedupeKey, DEDUPE_WINDOW_SECONDS)
      : redisShouldIncrease;

  req.pageviewsContext = {
    articleId,
    shouldIncrease
  };

  next();
};
