import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { findUserById } from '@/lib/db';
import { getEngineState } from '@/lib/trading/engine';

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const engine = getEngineState(userId);

    return NextResponse.json({
      engineStatus: engine.status,
      activeSymbol: engine.activeSymbol,
      currentStake: engine.currentStake,
      recentTicks: engine.recentTicks,
      activeContract: engine.activeContract,
      logs: engine.logs,
      startedAt: engine.startedAt,
      dailyStats: user.dailyStats,
      botSettings: user.botSettings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
