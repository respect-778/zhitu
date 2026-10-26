import { Router } from 'express';
import userRoutes from './userRoutes';
import communityRoutes from './communityRoutes';
import chatRoutes from './chatRoutes';
import oauthRoutes from './oauthRoutes';
import growthRoutes from './growthRoutes';
import resumeRoutes from './resumeRoutes';

const router = Router();

// 挂载用户路由
router.use('/user', userRoutes);

// 挂载社区路由
router.use('/community', communityRoutes);

// 挂载聊天路由
router.use('/chat', chatRoutes);

// 挂载 OAuth 路由
router.use('/oauth', oauthRoutes);

// 挂载成长规划路由
router.use('/growth', growthRoutes);
router.use('/resume', resumeRoutes);

export default router;
