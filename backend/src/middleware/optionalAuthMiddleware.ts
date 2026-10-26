import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './authMiddleware';
import { verifyAccessToken } from '../utils/authToken';

export const optionalAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  // 未携带 Authorization，按匿名访问处理
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    // 带了 token 但无效/过期，返回 401，前端可触发 refresh 流程
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: '令牌已过期' });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: '无效的令牌' });
      return;
    }

    console.error('optionalAuthMiddleware error:', error);
    res.status(500).json({ message: '认证失败' });
  }
};
