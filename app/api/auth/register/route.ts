import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, generateGSquadAccountId, generateVerificationCode, createSessionToken } from '@/lib/crypto';
import { findUserByEmail, createUser, User } from '@/lib/db';
import { setSessionCookie, sanitizeUser } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const { hash, salt } = hashPassword(password);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const accountNumber = generateGSquadAccountId();
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    const today = new Date().toISOString().split('T')[0];

    const newUser: User = {
      id: userId,
      accountNumber,
      email: email.toLowerCase().trim(),
      passwordHash: hash,
      salt,
      isVerified: false,
      verificationCode,
      verificationCodeExpiresAt,
      createdAt: new Date().toISOString(),
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
      dailyStats: {
        date: today,
        dailyProfitLoss: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        hitStopLoss: false,
        hitTakeProfit: false,
      },
    };

    createUser(newUser);

    const emailResult = await sendVerificationEmail(newUser.email, verificationCode, accountNumber);

    const sessionToken = createSessionToken(userId);
    const response = NextResponse.json({
      success: true,
      token: sessionToken,
      user: sanitizeUser(newUser),
      emailResult,
      message: 'Account registered successfully. Please verify your email.',
    });

    setSessionCookie(response, sessionToken);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Registration error: ${message}` }, { status: 500 });
  }
}
