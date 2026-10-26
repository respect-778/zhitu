import { Router } from 'express';
import { OAuthController } from '../controllers/oauthController';

const router = Router();

router.get('/github', OAuthController.redirectToGithub);
router.get('/github/callback', OAuthController.handleGithubCallback);

router.get('/google', OAuthController.redirectToGoogle);
router.get('/google/callback', OAuthController.handleGoogleCallback);

export default router;
