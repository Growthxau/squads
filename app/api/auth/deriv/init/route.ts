import { NextRequest, NextResponse } from 'next/server';
import {
  generatePkcePair,
  generateOAuthState,
  getDerivOAuthConfig,
  buildDerivAuthUrl,
  encryptOAuthTx,
  OAUTH_TX_COOKIE_NAME,
} from '@/lib/deriv/oauth';

export async function GET(req: NextRequest) {
  return handleInit(req);
}

export async function POST(req: NextRequest) {
  return handleInit(req);
}

async function handleInit(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    let mode: 'login' | 'register' = (searchParams.get('mode') as 'login' | 'register') || 'login';
    const direct = searchParams.get('direct') === 'true';

    // If POST with JSON body
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.mode === 'register' || body.mode === 'login') {
          mode = body.mode;
        }
      } catch {}
    }

    // 1. Generate PKCE pair and unique state
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = generateOAuthState();

    // 2. Resolve client ID and redirect URI
    const { clientId, redirectUri, isConfigured } = getDerivOAuthConfig(req);

    // 3. Build authorization URL
    const authUrl = buildDerivAuthUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
      mode,
    });

    // 4. Encrypt transaction details into an HttpOnly, Secure, SameSite=none cookie
    const txCookieValue = encryptOAuthTx({
      state,
      codeVerifier,
      mode,
      redirectUri,
      createdAt: Date.now(),
    });

    // 5. Build response
    let response: NextResponse;
    if (direct) {
      response = NextResponse.redirect(authUrl);
    } else {
      response = NextResponse.json({
        success: true,
        url: authUrl,
        state,
        mode,
        redirectUri,
        isConfigured,
      });
    }

    // Bind transaction to browser with HttpOnly, Secure, SameSite=none cookie
    response.cookies.set(OAUTH_TX_COOKIE_NAME, txCookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deriv OAuth Init] Error:', message);
    return NextResponse.json(
      { error: `Failed to initialize Deriv OAuth: ${message}` },
      { status: 500 }
    );
  }
}
