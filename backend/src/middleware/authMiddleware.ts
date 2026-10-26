import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/authToken';

// Extend Request type with userId
export interface AuthRequest extends Request {
  userId?: number;
  pageviewsContext?: {
    articleId: number;
    shouldIncrease: boolean;
  };
}

// Access-token authentication middleware
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: '未提供认证令牌' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: '令牌已过期' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: '无效的令牌' });
    } else {
      res.status(500).json({ message: '认证失败' });
    }
  }
};
