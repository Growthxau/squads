import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, sanitizeUser } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = findUserById(userId);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    botSettings: user.botSettings,
    dailyStats: user.dailyStats,
  });
}

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

    const body = await req.json();
    const { stake, maxDailyLoss, dailyProfitTarget, symbol, contractType } = body;

    // Validations
    const numStake = Number(stake);
    const numMaxLoss = Number(maxDailyLoss);
    const numProfitTarget = Number(dailyProfitTarget);

    if (isNaN(numStake) || numStake < 0.35) {
      return NextResponse.json({ error: 'Stake amount must be at least $0.35.' }, { status: 400 });
    }

    if (isNaN(numMaxLoss) || numMaxLoss < 1) {
      return NextResponse.json({ error: 'Maximum daily loss limit must be at least $1.00.' }, { status: 400 });
    }

    if (isNaN(numProfitTarget) || numProfitTarget < 1) {
      return NextResponse.json({ error: 'Daily profit target must be at least $1.00.' }, { status: 400 });
    }

    const validSymbols = ['R_100', 'R_75', 'R_50', 'R_25', 'R_10', '1HZ100V', '1HZ10V'];
    const chosenSymbol = validSymbols.includes(symbol) ? symbol : 'R_100';

    const validContractTypes = ['CALL', 'PUT', 'BOTH'];
    const chosenType = validContractTypes.includes(contractType) ? contractType : 'BOTH';

    const newBotSettings = {
      ...user.botSettings,
      stake: numStake,
      maxDailyLoss: numMaxLoss,
      dailyProfitTarget: numProfitTarget,
      symbol: chosenSymbol,
      contractType: chosenType as 'CALL' | 'PUT' | 'BOTH',
      durationTicks: 5, // strictly 5 ticks
    };

    const updated = updateUser(userId, { botSettings: newBotSettings });

    return NextResponse.json({
      success: true,
      botSettings: newBotSettings,
      user: updated ? sanitizeUser(updated) : null,
      message: 'Risk & trading configuration updated successfully.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
