import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, sanitizeUser } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';
import { stopTradingBot } from '@/lib/trading/engine';

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Stop bot first
    stopTradingBot(userId, 'Deriv account disconnected');

    const updated = updateUser(userId, {
      derivConnection: null,
      botSettings: {
        symbol: 'R_100',
        contractType: 'BOTH',
        durationTicks: 5,
        stake: 5.0,
        maxDailyLoss: 50.0,
        dailyProfitTarget: 100.0,
        isRunning: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Deriv account disconnected and secure tokens erased.',
      user: updated ? sanitizeUser(updated) : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
