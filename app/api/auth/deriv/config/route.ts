import { NextRequest, NextResponse } from 'next/server';
import { getDerivOAuthConfig } from '@/lib/deriv/oauth';

export async function GET(req: NextRequest) {
  const config = getDerivOAuthConfig(req);
  return NextResponse.json({
    isConfigured: config.isConfigured,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    envRedirectUri: process.env.DERIV_OAUTH_REDIRECT_URI || null,
    docsUrl: 'https://developers.deriv.com/docs/intro/oauth/',
  });
}
