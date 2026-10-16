import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { findUserById } from '@/lib/db';

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

    const hasPaymentGateway = Boolean(process.env.PAYMENT_GATEWAY_API_KEY || process.env.STRIPE_SECRET_KEY);
    const connectedAccount = user.derivConnection?.connectedAccountId;
    const isVirtual = user.derivConnection?.connectedAccountType === 'demo';

    return NextResponse.json({
      paymentGatewayConfigured: hasPaymentGateway,
      missingCredentials: hasPaymentGateway ? [] : ['PAYMENT_GATEWAY_API_KEY / STRIPE_SECRET_KEY'],
      connectedAccount,
      isVirtual,
      balance: user.derivConnection?.balance ?? 0,
      currency: user.derivConnection?.connectedCurrency ?? 'USD',
      derivCashierUrls: {
        deposit: 'https://app.deriv.com/cashier/deposit',
        withdrawal: 'https://app.deriv.com/cashier/withdrawal',
        transfer: 'https://app.deriv.com/cashier/account-transfer',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
