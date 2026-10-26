import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { OAuthAccountModel } from '../models/OAuthAccount';
import { generateRefreshToken, setRefreshTokenCookie } from '../utils/authToken';
import {
  generateOAuthState,
  buildGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUser
} from '../utils/oauthProviders';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const STATE_COOKIE = 'oauth_state';
const STATE_MAX_AGE = 5 * 60 * 1000;

function setStateCookie(res: Response, state: string): void {
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_MAX_AGE
  });
}

function getStateCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${STATE_COOKIE}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : undefined;
}

function clearStateCookie(res: Response): void {
  res.clearCookie(STATE_COOKIE, { path: '/' });
}

async function findOrCreateUser(
  provider: string,
  providerUserId: string,
  email: string,
  username: string,
  avatarUrl: string
): Promise<number> {
  const existingOAuth = await OAuthAccountModel.findByProviderUid(provider, providerUserId);
  if (existingOAuth) {
    return existingOAuth.user_id;
  }

  if (email) {
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      await OAuthAccountModel.create({
        userId: existingUser.id,
        provider,
        providerUserId,
        email,
        avatarUrl
      });
      return existingUser.id;
    }
  }

  let finalUsername = username;
  const taken = await UserModel.findByUsername(finalUsername);
  if (taken) {
    finalUsername = `${provider}_${providerUserId.slice(0, 8)}`;
  }

  const userId = await UserModel.createOAuthUser({
    username: finalUsername,
    email,
    avatar: avatarUrl
  });

  await OAuthAccountModel.create({
    userId,
    provider,
    providerUserId,
    email,
    avatarUrl
  });

  return userId;
}

function issueTokenAndRedirect(res: Response, userId: number, provider: string): void {
  const refreshToken = generateRefreshToken(userId);
  setRefreshTokenCookie(res, refreshToken);
  clearStateCookie(res);
  res.redirect(`${FRONTEND_URL}/oauth/callback?provider=${provider}`);
}

function handleOAuthError(res: Response, error: unknown, provider: string): void {
  console.error(`OAuth ${provider} error:`, error);
  clearStateCookie(res);
  res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
}

export class OAuthController {
  static redirectToGithub(_req: Request, res: Response): void {
    const state = generateOAuthState();
    setStateCookie(res, state);
    res.redirect(buildGitHubAuthUrl(state));
  }

  static async handleGithubCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const savedState = getStateCookie(req);

      if (!code || !state || state !== savedState) {
        res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
        return;
      }

      const accessToken = await exchangeGitHubCode(code);
      const ghUser = await getGitHubUser(accessToken);
      const userId = await findOrCreateUser('github', ghUser.id, ghUser.email, ghUser.login, ghUser.avatarUrl);
      issueTokenAndRedirect(res, userId, 'github');
    } catch (error) {
      handleOAuthError(res, error, 'github');
    }
  }

  static redirectToGoogle(_req: Request, res: Response): void {
    const state = generateOAuthState();
    setStateCookie(res, state);
    res.redirect(buildGoogleAuthUrl(state));
  }

  static async handleGoogleCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const savedState = getStateCookie(req);

      if (!code || !state || state !== savedState) {
        res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
        return;
      }

      const tokens = await exchangeGoogleCode(code);
      const gUser = await getGoogleUser(tokens.access_token);

      if (!gUser.emailVerified) {
        res.redirect(`${FRONTEND_URL}/login?error=email_not_verified`);
        return;
      }

      const username = gUser.name || `google_${gUser.id.slice(0, 8)}`;
      const userId = await findOrCreateUser('google', gUser.id, gUser.email, username, gUser.avatarUrl);
      issueTokenAndRedirect(res, userId, 'google');
    } catch (error) {
      handleOAuthError(res, error, 'google');
    }
  }
}
