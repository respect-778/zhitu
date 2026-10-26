import crypto from 'crypto';

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

interface GoogleUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function buildGitHubAuthUrl(state: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID!;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'read:user user:email',
    state
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGitHubCode(code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    })
  });

  const data = await res.json() as GitHubTokenResponse;
  if (!data.access_token) {
    throw new Error('GitHub code exchange failed');
  }
  return data.access_token;
}

export async function getGitHubUser(accessToken: string): Promise<{ id: string; login: string; avatarUrl: string; email: string }> {
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Knowvia' }
    }),
    fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Knowvia' }
    })
  ]);

  const user = await userRes.json() as GitHubUser;
  const emails = await emailsRes.json() as GitHubEmail[];

  const primaryEmail = emails.find(e => e.primary && e.verified);
  const verifiedEmail = primaryEmail?.email || emails.find(e => e.verified)?.email || user.email || '';

  return {
    id: String(user.id),
    login: user.login,
    avatarUrl: user.avatar_url,
    email: verifiedEmail
  };
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL!,
      grant_type: 'authorization_code'
    })
  });

  const data = await res.json() as GoogleTokenResponse;
  if (!data.access_token) {
    throw new Error('Google code exchange failed');
  }
  return data;
}

export async function getGoogleUser(accessToken: string): Promise<{ id: string; name: string; email: string; avatarUrl: string; emailVerified: boolean }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const user = await res.json() as GoogleUser;

  return {
    id: user.sub,
    name: user.name || '',
    email: user.email || '',
    avatarUrl: user.picture || '',
    emailVerified: user.email_verified ?? false
  };
}
