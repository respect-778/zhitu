import { Request, Response, NextFunction } from 'express';

// Global error middleware
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('错误:', err);

  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
