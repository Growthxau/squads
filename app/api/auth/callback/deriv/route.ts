import { NextRequest } from 'next/server';
import { handleDerivOAuthCallback } from '@/lib/deriv/callback-handler';

export async function GET(req: NextRequest) {
  return handleDerivOAuthCallback(req);
}

export async function POST(req: NextRequest) {
  return handleDerivOAuthCallback(req);
}
