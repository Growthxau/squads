import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, sanitizeUser } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';
import { validateDerivToken, requestAccountOtp } from '@/lib/deriv/api';
import { encryptData, maskToken } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    if (!user.isVerified) {
      return NextResponse.json({ error: 'Please verify your email before connecting Deriv.' }, { status: 403 });
    }

    const body = await req.json();
    const { pat } = body;

    if (!pat || typeof pat !== 'string' || pat.trim().length < 5) {
      return NextResponse.json({ error: 'Please enter a valid Deriv Personal Access Token.' }, { status: 400 });
    }

    const cleanPat = pat.trim();

    // 1. Validate PAT directly against Deriv API
    const validation = await validateDerivToken(cleanPat);
    if (!validation.success || !validation.details) {
      return NextResponse.json(
        { error: validation.error || 'Failed to authenticate Personal Access Token with Deriv.' },
        { status: 400 }
      );
    }

    const details = validation.details;
    const accounts = details.accounts || [];

    // Choose default account: prefer virtual/demo account for user safety
    const defaultAccount =
      accounts.find((a) => a.isVirtual) ||
      accounts.find((a) => a.id === details.loginid) ||
      accounts[0];

    const connectedAccountId = defaultAccount ? defaultAccount.id : details.loginid;
    const connectedAccountType = defaultAccount ? defaultAccount.type : (details.isVirtual ? 'demo' : 'real');
    const connectedCurrency = defaultAccount ? defaultAccount.currency : details.currency;
    const balance = defaultAccount ? defaultAccount.balance : details.balance;

    // Optional: test the documented OTP endpoint to verify account eligibility
    try {
      await requestAccountOtp(cleanPat, connectedAccountId);
    } catch (e) {
      console.warn('Optional OTP check skipped:', e);
    }

    // Encrypt token at rest
    const encryptedToken = encryptData(cleanPat);
    const tokenMask = maskToken(cleanPat);

    const derivConnection = {
      encryptedToken,
      tokenMask,
      connectedAccountId,
      connectedAccountType,
      connectedCurrency,
      balance,
      accounts,
      connectedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
    };

    const updated = updateUser(user.id, {
      derivConnection,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully connected Deriv account (${connectedAccountId}).`,
      accounts,
      connectedAccountId,
      connectedAccountType,
      balance,
      currency: connectedCurrency,
      tokenMask,
      user: updated ? sanitizeUser(updated) : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Connection failed: ${message}` }, { status: 500 });
  }
}
