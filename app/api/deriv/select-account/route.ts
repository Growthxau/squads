import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, sanitizeUser } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';
import { decryptData } from '@/lib/crypto';
import { fetchLiveBalance } from '@/lib/deriv/api';
import { stopTradingBot } from '@/lib/trading/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user || !user.derivConnection) {
      return NextResponse.json({ error: 'No Deriv connection found' }, { status: 400 });
    }

    const { accountId } = await req.json();
    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const matched = user.derivConnection.accounts.find((a) => a.id === accountId);
    if (!matched) {
      return NextResponse.json({ error: 'Account not found in your authorized list' }, { status: 400 });
    }

    // Stop bot if switching accounts to protect capital
    stopTradingBot(userId, `Switched Deriv account to ${accountId}`);

    // Fetch fresh balance
    let balance = matched.balance;
    try {
      const pat = decryptData(user.derivConnection.encryptedToken);
      const live = await fetchLiveBalance(pat, accountId);
      if (live && live.balance !== undefined) {
        balance = live.balance;
      }
    } catch (e) {
      console.warn('Failed to fetch fresh balance for switch:', e);
    }

    const updatedConn = {
      ...user.derivConnection,
      connectedAccountId: matched.id,
      connectedAccountType: matched.type,
      connectedCurrency: matched.currency,
      balance,
    };

    const updated = updateUser(userId, { derivConnection: updatedConn });

    return NextResponse.json({
      success: true,
      connectedAccountId: matched.id,
      connectedAccountType: matched.type,
      connectedCurrency: matched.currency,
      balance,
      user: updated ? sanitizeUser(updated) : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
