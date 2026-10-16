import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';
import { decryptData } from '@/lib/crypto';
import { fetchLiveBalance } from '@/lib/deriv/api';

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user || !user.derivConnection) {
      return NextResponse.json({ error: 'No Deriv account connected' }, { status: 400 });
    }

    const pat = decryptData(user.derivConnection.encryptedToken);
    const live = await fetchLiveBalance(pat, user.derivConnection.connectedAccountId);

    if (live && live.balance !== undefined) {
      user.derivConnection.balance = live.balance;
      user.derivConnection.connectedCurrency = live.currency || user.derivConnection.connectedCurrency;
      updateUser(user.id, { derivConnection: user.derivConnection });
      return NextResponse.json({
        balance: live.balance,
        currency: user.derivConnection.connectedCurrency,
      });
    }

    return NextResponse.json({
      balance: user.derivConnection.balance,
      currency: user.derivConnection.connectedCurrency,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
