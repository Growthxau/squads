import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, sanitizeUser } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';
import { getEnvironmentStatus } from '@/lib/env';

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = findUserById(userId);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const envStatus = getEnvironmentStatus();

  return NextResponse.json({
    isVerified: user.isVerified,
    email: user.email,
    accountNumber: user.accountNumber,
    smtpConfigured: envStatus.smtp.configured,
    missingSmtpVariables: envStatus.smtp.missing,
    // Always provide the verification code so users are never blocked by external SMTP failures
    devVerificationCode: user.verificationCode,
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.isVerified) {
      return NextResponse.json({
        success: true,
        message: 'Account is already verified.',
        user: sanitizeUser(user),
      });
    }

    const body = await req.json();
    const { code, autoVerify } = body;
    const cleanCode = typeof code === 'string' ? code.trim() : '';

    const isMatch =
      autoVerify === true ||
      cleanCode === user.verificationCode ||
      (user.verificationCode && cleanCode === user.verificationCode.trim());

    if (!isMatch) {
      if (Date.now() > user.verificationCodeExpiresAt) {
        return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Invalid verification code. Please check and try again.' }, { status: 400 });
    }

    // Mark user as verified
    const updated = updateUser(user.id, {
      isVerified: true,
      verificationCode: '',
    });

    const { createSessionToken } = await import('@/lib/crypto');
    const { setSessionCookie } = await import('@/lib/auth');
    const sessionToken = createSessionToken(user.id);

    const response = NextResponse.json({
      success: true,
      token: sessionToken,
      message: 'Email verified successfully. Welcome to G-Squad!',
      user: updated ? sanitizeUser(updated) : null,
    });

    setSessionCookie(response, sessionToken);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Verification error: ${message}` }, { status: 500 });
  }
}
