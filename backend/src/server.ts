import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import routes from './routes';
import { logger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { testConnection } from './utils/db';
import { initRedis } from './utils/redis';
import { GrowthWorkspaceModel } from './models/GrowthWorkspace';
import { ResumeWorkspaceModel } from './models/ResumeWorkspace';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// 中间件配置
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true
  })
);
// 简历含照片；只扩大简历接口的请求上限，其他接口保持原限制。
app.use('/resume', express.json({ limit: '10mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '服务运行正常' });
});

app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// 挂载路由
app.use('/', routes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 错误处理中间件（必须在最后）
app.use(errorHandler);

const startServer = async () => {
  try {
    const dbConnected = await testConnection();
    if (dbConnected) {
      await GrowthWorkspaceModel.ensureSchema();
      await ResumeWorkspaceModel.ensureSchema();
    }
    const redisConnected = await initRedis();

    if (!dbConnected) {
      console.error('数据库连接失败，但服务将继续启动');
    }

    if (!redisConnected) {
      console.error('Redis 连接失败，将以内存降级策略继续运行');
    }

    app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log('知途后端服务启动成功');
      console.log(`地址: http://localhost:${PORT}`);
      console.log(`CORS允许来源: ${CORS_ORIGIN}`);
      console.log(`数据库: ${dbConnected ? '已连接' : '未连接'}`);
      console.log(`Redis: ${redisConnected ? '已连接' : '未连接'}`);
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('服务器启动失败', error);
    process.exit(1);
  }
};

startServer();
