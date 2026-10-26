import type { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

type TokenType = 'access' | 'refresh';

export interface AuthTokenPayload extends jwt.JwtPayload {
  userId: number;
  tokenType: TokenType;
  sessionExp?: number;
}

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || 'zhitu_secret_key';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || `${ACCESS_TOKEN_SECRET}_refresh_secret`;
const ACCESS_TOKEN_EXPIRES_IN = (process.env.ACCESS_TOKEN_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn'];
const REFRESH_TOKEN_EXPIRES_IN = (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
const REFRESH_SESSION_MAX_AGE = (process.env.REFRESH_SESSION_MAX_AGE || '7d') as jwt.SignOptions['expiresIn'];
export const REFRESH_TOKEN_COOKIE_NAME = process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken';

const parseExpiresToMs = (
  value: jwt.SignOptions['expiresIn'],
  fallbackMs: number
): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value * 1000;
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (/^\d+$/.test(raw)) {
      return Number(raw) * 1000;
    }

    const match = raw.match(/^(\d+)([smhd])$/i);
    if (match) {
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      if (unit === 's') return amount * 1000;
      if (unit === 'm') return amount * 60 * 1000;
      if (unit === 'h') return amount * 60 * 60 * 1000;
      if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
    }
  }

  return fallbackMs;
};

const getRefreshCookieOptions = (): CookieOptions => {
  const sameSiteRaw = (process.env.REFRESH_COOKIE_SAMESITE || 'lax').toLowerCase();
  const sameSite: CookieOptions['sameSite'] =
    sameSiteRaw === 'none' || sameSiteRaw === 'strict' ? sameSiteRaw : 'lax';

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    path: '/',
    maxAge: parseExpiresToMs(REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000)
  };
};

const verifyToken = (
  token: string,
  secret: string,
  expectedTokenType: TokenType
): AuthTokenPayload => {
  const decoded = jwt.verify(token, secret) as AuthTokenPayload;
  if (decoded.tokenType !== expectedTokenType || typeof decoded.userId !== 'number') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }
  return decoded;
};

const parseCookieHeader = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const index = pair.indexOf('=');
      if (index <= 0) return acc;
      const key = decodeURIComponent(pair.slice(0, index));
      const value = decodeURIComponent(pair.slice(index + 1));
      acc[key] = value;
      return acc;
    }, {});
};

export const generateAccessToken = (userId: number): string => {
  return jwt.sign({ userId, tokenType: 'access' }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN
  });
};

export const generateRefreshToken = (userId: number, sessionExp?: number): string => {
  const absoluteSessionExp = sessionExp
    ?? Math.floor((Date.now() + parseExpiresToMs(REFRESH_SESSION_MAX_AGE, 7 * 24 * 60 * 60 * 1000)) / 1000);

  return jwt.sign({ userId, tokenType: 'refresh', sessionExp: absoluteSessionExp }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN
  });
};

export const verifyAccessToken = (token: string): AuthTokenPayload => {
  return verifyToken(token, ACCESS_TOKEN_SECRET, 'access');
};

export const verifyRefreshToken = (token: string): AuthTokenPayload => {
  return verifyToken(token, REFRESH_TOKEN_SECRET, 'refresh');
};

export const isRefreshSessionExpired = (payload: AuthTokenPayload): boolean => {
  if (typeof payload.sessionExp !== 'number' || !Number.isFinite(payload.sessionExp)) {
    return true;
  }
  return payload.sessionExp <= Math.floor(Date.now() / 1000);
};

export const getRefreshTokenFromRequest = (req: Request): string | null => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[REFRESH_TOKEN_COOKIE_NAME] || null;
};

export const setRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
};

export const clearRefreshTokenCookie = (res: Response): void => {
  const { maxAge, ...opts } = getRefreshCookieOptions();
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, opts);
};
