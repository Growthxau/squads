import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getUserIdFromRequest } from '@/lib/auth';
import { stopTradingBot } from '@/lib/trading/engine';

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (userId) {
    stopTradingBot(userId, 'User signed out');
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  clearSessionCookie(response);
  return response;
}
