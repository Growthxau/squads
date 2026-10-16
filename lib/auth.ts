import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from './crypto';
import { findUserById, User, DerivAccountInfo } from './db';

export const SESSION_COOKIE_NAME = 'gsquad_session';

export interface SanitizedUser {
  id: string;
  accountNumber: string;
  email: string;
  isVerified: boolean;
  derivConnection: {
    connected: boolean;
    tokenMask: string;
    connectedAccountId: string;
    connectedAccountType: 'real' | 'demo';
    connectedCurrency: string;
    balance: number;
    accounts: DerivAccountInfo[];
    connectedAt: string;
  } | null;
  botSettings: User['botSettings'];
  dailyStats: User['dailyStats'];
}

export function sanitizeUser(user: User): SanitizedUser {
  return {
    id: user.id,
    accountNumber: user.accountNumber,
    email: user.email,
    isVerified: user.isVerified,
    derivConnection: user.derivConnection
      ? {
          connected: true,
          tokenMask: user.derivConnection.tokenMask,
          connectedAccountId: user.derivConnection.connectedAccountId,
          connectedAccountType: user.derivConnection.connectedAccountType,
          connectedCurrency: user.derivConnection.connectedCurrency,
          balance: user.derivConnection.balance,
          accounts: user.derivConnection.accounts,
          connectedAt: user.derivConnection.connectedAt,
        }
      : null,
    botSettings: user.botSettings,
    dailyStats: user.dailyStats,
  };
}

export async function getCurrentUserFromCookies(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifySessionToken(token);
    if (!payload) return null;

    return findUserById(payload.userId);
  } catch {
    return null;
  }
}

export function getUserIdFromRequest(req: NextRequest): string | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  return payload?.userId || null;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
