import { Router } from 'express';
import { ChatController } from '../controllers/chatController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.post('/call', ChatController.call);
router.post('/polish', ChatController.polish);
router.post('/uploadAiModel', ChatController.uploadAiModel);
router.get('/getAiModel', ChatController.getAiModel);

router.post('/addSession', ChatController.createSession);
router.post('/renameTitle', ChatController.renameTitle);
router.get('/history', ChatController.getHistory);
router.delete('/delSession/:session_id', ChatController.deleteSession);

router.post('/addMessage', ChatController.addMessage);
router.delete('/message/:message_id', ChatController.deleteMessage);
router.get('/getMessage', ChatController.getMessage);
router.get('/getSummaryMessage', ChatController.getSummaryMessage);

export default router;
