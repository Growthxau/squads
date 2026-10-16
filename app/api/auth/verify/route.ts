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
    // If SMTP is unconfigured, provide the code so development and onboarding is testable without failure
    devVerificationCode: envStatus.smtp.configured ? null : user.verificationCode,
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

    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }

    const cleanCode = code.trim();

    if (Date.now() > user.verificationCodeExpiresAt) {
      return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
    }

    if (cleanCode !== user.verificationCode) {
      return NextResponse.json({ error: 'Invalid verification code. Please check and try again.' }, { status: 400 });
    }

    // Mark user as verified
    const updated = updateUser(user.id, {
      isVerified: true,
      verificationCode: '',
    });

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully. Welcome to G-Squad!',
      user: updated ? sanitizeUser(updated) : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Verification error: ${message}` }, { status: 500 });
  }
}
