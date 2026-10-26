import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getWorkspace, saveWorkspace, getHighlights, saveHighlights, addCitation } from '../controllers/growthController';

const router = Router();

// 获取当前用户的工作区数据（虚拟文件系统、标签页状态等）
router.get('/workspace', authMiddleware, getWorkspace);

// 保存/更新工作区数据（前端 debounce 1.5s 后调用）
router.put('/workspace', authMiddleware, saveWorkspace);

// 文章高亮标注
router.get('/highlights/:postId', authMiddleware, getHighlights);
router.put('/highlights/:postId', authMiddleware, saveHighlights);

// 添加引用到工作区
router.post('/cite', authMiddleware, addCitation);

export default router;
