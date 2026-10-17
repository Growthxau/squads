import { NextRequest, NextResponse } from 'next/server';
import {
  decryptOAuthTx,
  exchangeCodeForTokens,
  fetchDerivAccountIdentity,
  getDerivOAuthConfig,
  OAUTH_TX_COOKIE_NAME,
} from './oauth';
import {
  findUserByDerivAccountId,
  findUserByEmail,
  createUser,
  updateUser,
  User,
} from '@/lib/db';
import {
  createSessionToken,
  encryptData,
  generateGSquadAccountId,
  maskToken,
} from '@/lib/crypto';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

/**
 * Shared OAuth Callback Handler
 * Handles both popup-based (AI Studio preview iframe) and top-level redirects (Vercel).
 */
export async function handleDerivOAuthCallback(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description') || searchParams.get('message');

  console.log('[Deriv OAuth Callback] Processing callback request...');

  // 1. Handle Provider Errors (e.g. access_denied, consent_declined)
  if (error) {
    const errorMsg = errorDescription || error;
    console.warn(`[Deriv OAuth Callback] Provider returned error: ${error} (${errorMsg})`);
    return renderOAuthResultHtml({
      success: false,
      error: errorMsg,
      errorCode: error,
    });
  }

  // 2. Validate mandatory parameters
  if (!code || !state) {
    console.warn('[Deriv OAuth Callback] Missing code or state in callback URL');
    return renderOAuthResultHtml({
      success: false,
      error: 'Missing authorization code or state parameter from Deriv.',
      errorCode: 'missing_parameters',
    });
  }

  // 3. Retrieve and decrypt the transaction cookie
  const txCookie = req.cookies.get(OAUTH_TX_COOKIE_NAME)?.value;
  if (!txCookie) {
    console.warn('[Deriv OAuth Callback] No OAuth transaction cookie found');
    return renderOAuthResultHtml({
      success: false,
      error: 'OAuth login transaction expired or cookies are disabled in your browser. Please try logging in again.',
      errorCode: 'missing_transaction_cookie',
    });
  }

  const tx = decryptOAuthTx(txCookie);
  if (!tx) {
    console.warn('[Deriv OAuth Callback] Failed to decrypt or validate OAuth transaction');
    return renderOAuthResultHtml({
      success: false,
      error: 'Invalid or expired OAuth transaction. Please try logging in again.',
      errorCode: 'invalid_transaction',
    });
  }

  // 4. Validate State (CSRF Protection)
  if (tx.state !== state) {
    console.warn('[Deriv OAuth Callback] State mismatch detected! Stored:', tx.state, 'Received:', state);
    return renderOAuthResultHtml({
      success: false,
      error: 'State verification failed. Possible Cross-Site Request Forgery (CSRF) detected.',
      errorCode: 'state_mismatch',
    });
  }

  // 5. Exchange code for access token
  const { clientId } = getDerivOAuthConfig(req);
  const redirectUri = tx.redirectUri;

  let tokenResponse;
  try {
    tokenResponse = await exchangeCodeForTokens({
      clientId,
      code,
      codeVerifier: tx.codeVerifier,
      redirectUri,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deriv OAuth Callback] Code exchange network error:', message);
    return renderOAuthResultHtml({
      success: false,
      error: `Failed to exchange authorization code: ${message}`,
      errorCode: 'token_exchange_network_error',
    });
  }

  if (tokenResponse.error || !tokenResponse.access_token) {
    console.warn('[Deriv OAuth Callback] Token exchange rejected:', tokenResponse.error_description);
    return renderOAuthResultHtml({
      success: false,
      error: tokenResponse.error_description || 'Deriv rejected the authorization code.',
      errorCode: tokenResponse.error || 'token_exchange_rejected',
    });
  }

  const accessToken = tokenResponse.access_token;

  // 6. Resolve stable Deriv account identity via authenticated API
  let identity;
  try {
    identity = await fetchDerivAccountIdentity(accessToken);
    console.log(`[Deriv OAuth Callback] Resolved Deriv identity: ${identity.accountId} (${identity.accountType})`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Deriv OAuth Callback] Failed to resolve identity:', message);
    return renderOAuthResultHtml({
      success: false,
      error: `Could not verify Deriv account identity: ${message}`,
      errorCode: 'identity_verification_failed',
    });
  }

  // 7. Locate or create local G-Squad user
  let user: User | null = findUserByDerivAccountId(identity.accountId);

  if (!user && identity.email) {
    user = findUserByEmail(identity.email);
  }

  const encryptedToken = encryptData(accessToken);
  const tokenMask = maskToken(accessToken);
  const now = new Date().toISOString();
  const expiresAt = Date.now() + (tokenResponse.expires_in || 3600) * 1000;

  const derivConnection = {
    encryptedToken,
    tokenMask,
    connectedAccountId: identity.accountId,
    connectedAccountType: identity.accountType,
    connectedCurrency: identity.currency,
    balance: identity.balance,
    accounts: identity.accounts,
    connectedAt: now,
    lastValidatedAt: now,
    oauth: {
      expiresAt,
      scope: tokenResponse.scope || 'trade',
      tokenType: tokenResponse.token_type || 'Bearer',
    },
  };

  if (!user) {
    // Register new G-Squad user with verified Deriv credentials
    const newUserId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const accountNumber = generateGSquadAccountId();
    const email = identity.email || `${identity.accountId.toLowerCase()}@deriv.oauth`;

    user = {
      id: newUserId,
      accountNumber,
      email,
      passwordHash: '',
      salt: '',
      isVerified: true, // Deriv OAuth accounts are pre-verified
      verificationCode: '',
      verificationCodeExpiresAt: 0,
      createdAt: now,
      derivConnection,
      botSettings: {
        symbol: 'R_100',
        contractType: 'BOTH',
        durationTicks: 5,
        stake: 5.0,
        maxDailyLoss: 50.0,
        dailyProfitTarget: 100.0,
        maxRun: 5,
        isRunning: false,
      },
      dailyStats: {
        date: now.split('T')[0],
        dailyProfitLoss: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        hitStopLoss: false,
        hitTakeProfit: false,
      },
    };
    createUser(user);
    console.log(`[Deriv OAuth Callback] Created new G-Squad user: ${user.id} (${user.accountNumber})`);
  } else {
    // Existing user: link/update Deriv connection
    user = updateUser(user.id, {
      derivConnection,
      isVerified: true,
    });
    console.log(`[Deriv OAuth Callback] Linked Deriv account to user: ${user?.id} (${user?.accountNumber})`);
  }

  if (!user) {
    return renderOAuthResultHtml({
      success: false,
      error: 'Failed to save account state in database.',
      errorCode: 'db_save_error',
    });
  }

  // 8. Establish session token
  const sessionToken = createSessionToken(user.id);

  // 9. Render success page with postMessage and cookie
  const response = renderOAuthResultHtml({
    success: true,
    sessionToken,
    accountId: identity.accountId,
    accountNumber: user.accountNumber,
  });

  // Set session cookie (SameSite=none & Secure for cross-origin iframe compliance)
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  // Delete short-lived OAuth transaction cookie
  response.cookies.set(OAUTH_TX_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 0,
  });

  return response;
}

/**
 * Render HTML response for OAuth popup or top-level redirect.
 */
function renderOAuthResultHtml(params: {
  success: boolean;
  error?: string;
  errorCode?: string;
  sessionToken?: string;
  accountId?: string;
  accountNumber?: string;
}): NextResponse {
  const status = params.success ? 200 : 400;

  const html = params.success
    ? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Deriv Authentication Successful · G-Squad</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px 24px;
      text-align: center;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .icon {
      width: 52px;
      height: 52px;
      background: #ecfdf5;
      color: #059669;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }
    h2 { font-size: 18px; margin: 0 0 8px; font-weight: 700; color: #0f172a; }
    p { font-size: 13px; margin: 0 0 16px; color: #64748b; line-height: 1.5; }
    .badge {
      display: inline-block;
      padding: 6px 12px;
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 8px;
      font-family: monospace;
      font-weight: 700;
      font-size: 12px;
      color: #dc2626;
      margin-bottom: 20px;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #fee2e2;
      border-top-color: #dc2626;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h2>Authenticated with Deriv</h2>
    <p>Account <strong>${params.accountId || ''}</strong> successfully connected to G-Squad.</p>
    <div class="badge">G-Squad Profile: ${params.accountNumber || ''}</div>
    <div class="spinner"></div>
  </div>
  <script>
    (function() {
      var token = "${params.sessionToken || ''}";
      try {
        if (token && typeof localStorage !== 'undefined') {
          localStorage.setItem('gsquad_session_token', token);
        }
      } catch (e) {}

      // Notify parent window if opened via popup
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({
            type: 'OAUTH_AUTH_SUCCESS',
            token: token,
            accountId: "${params.accountId || ''}",
            accountNumber: "${params.accountNumber || ''}"
          }, '*');
          setTimeout(function() { window.close(); }, 600);
          return;
        } catch (e) {}
      }

      // If top-level redirect or opener closed, redirect to dashboard
      setTimeout(function() {
        window.location.replace('/dashboard');
      }, 750);
    })();
  </script>
</body>
</html>`
    : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Deriv Authentication Error · G-Squad</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #fee2e2;
      border-radius: 16px;
      padding: 32px 24px;
      text-align: center;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .icon {
      width: 52px;
      height: 52px;
      background: #fff1f2;
      color: #e11d48;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }
    h2 { font-size: 18px; margin: 0 0 8px; font-weight: 700; color: #9f1239; }
    p { font-size: 13px; margin: 0 0 20px; color: #475569; line-height: 1.5; }
    .err-code {
      font-family: monospace;
      font-size: 11px;
      background: #f1f5f9;
      padding: 4px 8px;
      border-radius: 6px;
      color: #64748b;
      margin-bottom: 20px;
      display: inline-block;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #dc2626;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      border-radius: 10px;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .btn:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h2>Authentication Error</h2>
    <p>${params.error || 'Failed to complete Deriv OAuth authorization.'}</p>
    ${params.errorCode ? `<div class="err-code">Code: ${params.errorCode}</div><br>` : ''}
    <a href="/auth/login" class="btn" id="retry-btn">Return to Sign In</a>
  </div>
  <script>
    (function() {
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({
            type: 'OAUTH_AUTH_ERROR',
            error: "${(params.error || '').replace(/"/g, '\\"')}",
            errorCode: "${params.errorCode || ''}"
          }, '*');
          var btn = document.getElementById('retry-btn');
          if (btn) {
            btn.onclick = function(e) {
              e.preventDefault();
              window.close();
            };
            btn.textContent = 'Close Window';
          }
        } catch (e) {}
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
