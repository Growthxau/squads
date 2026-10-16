import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, sanitizeUser } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';
import { decryptData } from '@/lib/crypto';
import { fetchLiveBalance } from '@/lib/deriv/api';

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Refresh Deriv balance in the background if connected
    if (user.derivConnection && user.derivConnection.encryptedToken) {
      try {
        const pat = decryptData(user.derivConnection.encryptedToken);
        const live = await fetchLiveBalance(pat, user.derivConnection.connectedAccountId);
        if (live && live.balance !== undefined) {
          user.derivConnection.balance = live.balance;
          user.derivConnection.connectedCurrency = live.currency || user.derivConnection.connectedCurrency;
          updateUser(user.id, { derivConnection: user.derivConnection });
        }
      } catch (e) {
        console.warn('Could not refresh balance in /api/auth/me:', e);
      }
    }

    return NextResponse.json({
      authenticated: true,
      user: sanitizeUser(user),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
