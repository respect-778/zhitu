import { createClient, type RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_REDIS_HOST = '127.0.0.1';
const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_REDIS_DB = 0;

const redisUrl = process.env.REDIS_URL?.trim();
const redisHost = process.env.REDIS_HOST || DEFAULT_REDIS_HOST;
const parsedRedisPort = Number.parseInt(process.env.REDIS_PORT || `${DEFAULT_REDIS_PORT}`, 10);
const redisPort = Number.isFinite(parsedRedisPort) ? parsedRedisPort : DEFAULT_REDIS_PORT;
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const parsedRedisDb = Number.parseInt(process.env.REDIS_DB || `${DEFAULT_REDIS_DB}`, 10);
const redisDb = Number.isFinite(parsedRedisDb) ? parsedRedisDb : DEFAULT_REDIS_DB;

const redisClient: RedisClientType = redisUrl
  ? createClient({ url: redisUrl })
  : createClient({
      socket: {
        host: redisHost,
        port: redisPort
      },
      password: redisPassword,
      database: redisDb
    });

let redisReady = false;
let redisConnectPromise: Promise<void> | null = null;

redisClient.on('ready', () => {
  redisReady = true;
  console.log('Redis 已连接');
});

redisClient.on('end', () => {
  redisReady = false;
  console.warn('Redis 连接已关闭');
});

redisClient.on('error', (error) => {
  redisReady = false;
  console.error('Redis 错误:', error);
});

export const initRedis = async (): Promise<boolean> => {
  if (redisClient.isReady) {
    redisReady = true;
    return true;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redisClient
      .connect()
      .then(() => {
        redisReady = true;
      })
      .catch((error) => {
        redisReady = false;
        console.error('Redis 连接失败:', error);
      })
      .finally(() => {
        redisConnectPromise = null;
      });
  }

  await redisConnectPromise;
  return redisReady;
};

export const isRedisReady = (): boolean => redisReady && redisClient.isReady;

export const getRedisClient = (): RedisClientType => redisClient;

export const incrWithExpire = async (key: string, ttlSeconds: number): Promise<number | null> => {
  if (!isRedisReady()) return null;
  try {
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, ttlSeconds);
    }
    return count;
  } catch (error) {
    console.error('Redis incrWithExpire 失败:', error);
    return null;
  }
};

export const setNxWithExpire = async (key: string, ttlSeconds: number): Promise<boolean | null> => {
  if (!isRedisReady()) return null;
  try {
    const result = await redisClient.set(key, '1', {
      NX: true,
      EX: ttlSeconds
    });
    return result === 'OK';
  } catch (error) {
    console.error('Redis setNxWithExpire 失败:', error);
    return null;
  }
};
