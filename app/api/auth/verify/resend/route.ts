import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { findUserById, updateUser } from '@/lib/db';
import { generateVerificationCode } from '@/lib/crypto';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (user.isVerified) {
      return NextResponse.json({ error: 'Account is already verified.' }, { status: 400 });
    }

    const newCode = generateVerificationCode();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    updateUser(user.id, {
      verificationCode: newCode,
      verificationCodeExpiresAt: expiresAt,
    });

    const emailResult = await sendVerificationEmail(user.email, newCode, user.accountNumber);

    return NextResponse.json({
      success: true,
      message: emailResult.sent
        ? `A new verification code was sent to ${user.email}.`
        : emailResult.message,
      emailResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Resend error: ${message}` }, { status: 500 });
  }
}
