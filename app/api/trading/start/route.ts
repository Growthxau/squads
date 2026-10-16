import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { findUserById } from '@/lib/db';
import { startTradingBot } from '@/lib/trading/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.isVerified) {
      return NextResponse.json({ error: 'Account email must be verified before trading.' }, { status: 403 });
    }

    if (!user.derivConnection || !user.derivConnection.encryptedToken) {
      return NextResponse.json(
        { error: 'No Deriv account connected. Please connect your Deriv PAT on the Connect page first.' },
        { status: 400 }
      );
    }

    // Check risk limits on server
    if (user.dailyStats.hitStopLoss) {
      return NextResponse.json(
        { error: 'Cannot start bot: Maximum daily loss limit was reached today. Risk protocol active.' },
        { status: 400 }
      );
    }

    if (user.dailyStats.hitTakeProfit) {
      return NextResponse.json(
        { error: 'Cannot start bot: Daily profit target reached today. Capital banked.' },
        { status: 400 }
      );
    }

    // Start bot
    const result = await startTradingBot(userId);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to start trading bot.' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'G-Squad autonomous trading bot started. Scanning market ticks...',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
