import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Router } from 'express';
import { CommunityController } from '../controllers/communityController';
import { authMiddleware } from '../middleware/authMiddleware';
import { optionalAuthMiddleware } from '../middleware/optionalAuthMiddleware';
import { pageviewsGuardMiddleware } from '../middleware/pageviewsGuardMiddleware';
import { ResponseUtil } from '../utils/response';

const router = Router();

const uploadDir = path.resolve(__dirname, '..', '..', 'uploads', 'community', 'images');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const fallbackExt =
      file.mimetype === 'image/png'
        ? '.png'
        : file.mimetype === 'image/webp'
          ? '.webp'
          : file.mimetype === 'image/gif'
            ? '.gif'
            : '.jpg';
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || fallbackExt}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 9
  },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowed.has(file.mimetype)) {
      cb(new Error('只能上传 JPG/PNG/WEBP/GIF 格式的图片'));
      return;
    }
    cb(null, true);
  }
});

router.get('/list', optionalAuthMiddleware, CommunityController.getList);
router.get('/search', optionalAuthMiddleware, CommunityController.search);
router.get('/weekly', optionalAuthMiddleware, CommunityController.getWeeklyDigest);
router.get('/hot', optionalAuthMiddleware, CommunityController.getHotList);
router.get('/new', optionalAuthMiddleware, CommunityController.getNewList);
router.get('/earlyReport', optionalAuthMiddleware, CommunityController.getEarlyReport);
router.get('/:id/comments', CommunityController.getComments);

// 需要认证的路由
router.post('/post', authMiddleware, CommunityController.createPost);
router.post('/add', authMiddleware, CommunityController.addPost);
router.post('/abstract', authMiddleware, CommunityController.generateAbstract);
router.post('/keywords', authMiddleware, CommunityController.generateKeywords);
router.post(
  '/image',
  authMiddleware,
  (req, res, next) => {
    upload.array('files', 9)(req, res, (err) => {
      if (err) {
        res.status(400).json(ResponseUtil.error(err.message || '图片上传失败'));
        return;
      }
      next();
    });
  },
  CommunityController.uploadImage
);
router.post('/like/:id', authMiddleware, CommunityController.likePost);
router.post('/favorite/:id', authMiddleware, CommunityController.favoritePost);
router.get('/like', authMiddleware, CommunityController.likeByQuery);
router.get('/collected', authMiddleware, CommunityController.collectedByQuery);
router.post('/follow', authMiddleware, CommunityController.followAuthor);
router.get('/following', authMiddleware, CommunityController.getFollowingList);
router.post('/comment/:id', authMiddleware, CommunityController.commentPost);
router.get('/pageviews', authMiddleware, pageviewsGuardMiddleware, CommunityController.pageviewsByQuery);

// 文件夹
router.post('/folder', authMiddleware, CommunityController.createFolder);
router.get('/folders', authMiddleware, CommunityController.getFolders);
router.delete('/folder/:id', authMiddleware, CommunityController.deleteFolder);
router.put('/folder/:id', authMiddleware, CommunityController.renameFolder);

// 阅读历史
router.get('/history', authMiddleware, CommunityController.getReadingHistory);
router.delete('/history/:id', authMiddleware, CommunityController.deleteHistory);
router.put('/history/:id/folder', authMiddleware, CommunityController.moveHistoryToFolder);

// 收藏列表
router.get('/favorites', authMiddleware, CommunityController.getCollectionList);
router.delete('/favorites/:id', authMiddleware, CommunityController.deleteCollection);
router.put('/favorites/:id/folder', authMiddleware, CommunityController.moveCollectionToFolder);

// 用户文章列表
router.get('/user/:id/posts', optionalAuthMiddleware, CommunityController.getUserPosts);

router.get('/:id', optionalAuthMiddleware, CommunityController.getById);

export default router;
