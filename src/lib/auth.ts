import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { TelegramAuthError } from '@/lib/telegram';
import { createWebSession, deleteWebSession, getWebSession } from '@/lib/db';

export const SESSION_COOKIE = 'tb_session';
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

/** Register a fresh web-session token for a signed-in user. */
export async function issueWebSession(userId: string): Promise<string> {
  const token = newToken();
  await createWebSession(token, userId);
  return token;
}

/**
 * Resolve the signed-in Telegram user id for a request, or null when the
 * browser has no (valid) web session cookie.
 */
export async function currentUserId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getWebSession(token);
  return session?.user_id ?? null;
}

/**
 * Resolve the signed-in user id and throw when the browser is not signed in.
 */
export async function requireUserId(request: NextRequest): Promise<string> {
  const userId = await currentUserId(request);
  if (!userId) {
    throw new TelegramAuthError('Please sign in to use this.'); // 401
  }
  return userId;
}

export async function webSessionCookieFor(userId: string) {
  const token = await issueWebSession(userId);
  const secure = process.env.NODE_ENV === 'production';
  return {
    token,
    cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${
      secure ? '; Secure' : ''
    }`,
  };
}

export function attachWebSession(
  response: NextResponse,
  token: string
): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}

export async function clearWebSession(request: NextRequest, response: NextResponse): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteWebSession(token);
  }
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}