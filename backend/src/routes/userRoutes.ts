import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { authMiddleware } from '../middleware/authMiddleware';
import { optionalAuthMiddleware } from '../middleware/optionalAuthMiddleware';

const router = Router();

// Public routes
router.post('/login', UserController.login);
router.post('/register', UserController.register);
router.post('/refresh', UserController.refresh);
router.post('/logout', UserController.logout);

// Public routes (with optional auth)
router.get('/profile/:id', authMiddleware, UserController.getUserProfile);

// Authorized routes
router.get('/info', authMiddleware, UserController.getUserInfo);
router.put('/info', authMiddleware, UserController.updateUserInfo);

export default router;
