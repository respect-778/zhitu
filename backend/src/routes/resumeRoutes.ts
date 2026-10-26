import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getResumes, saveResumes } from '../controllers/resumeController';

const router = Router();
router.use(authMiddleware);
router.get('/workspace', getResumes);
router.put('/workspace', saveResumes);
export default router;
