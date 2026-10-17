import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { encryptData, decryptData } from '@/lib/crypto';
import { DERIV_PRIMARY_HOST, DERIV_WS_OPTIONS, getDerivWsUrl } from './api';
import WebSocket from 'ws';

export const DERIV_OAUTH_AUTH_URL = 'https://auth.deriv.com/oauth2/auth';
export const DERIV_OAUTH_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';
export const DERIV_OAUTH_API_BASE = 'https://api.derivws.com';
export const OAUTH_TX_COOKIE_NAME = 'deriv_oauth_tx';

export interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  mode: 'login' | 'register';
  redirectUri: string;
  createdAt: number;
}

export interface DerivTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface DerivResolvedIdentity {
  accountId: string; // e.g. CR123456 or VRTC123456 or DOT...
  accountType: 'real' | 'demo';
  currency: string;
  balance: number;
  email?: string;
  accounts: Array<{
    id: string;
    type: 'real' | 'demo';
    currency: string;
    balance: number;
    isVirtual: boolean;
  }>;
  rawSource: 'rest' | 'websocket' | 'combined';
}

/**
 * Generate a cryptographically secure PKCE code_verifier (64 chars URL-safe)
 * and its S256 code_challenge per RFC 7636.
 */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  // 48 random bytes -> 64-char base64url string (valid range is 43-128 chars)
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier, 'ascii')
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Generate a cryptographically random state parameter for CSRF protection.
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Determine the registered Client ID and Redirect URI.
 */
export function getDerivOAuthConfig(req?: NextRequest): {
  clientId: string;
  redirectUri: string;
  isConfigured: boolean;
} {
  const envClientId = process.env.DERIV_OAUTH_CLIENT_ID || process.env.DERIV_APP_ID;
  const clientId = (envClientId && envClientId.trim().length > 0) ? envClientId.trim() : '1089';

  let redirectUri = process.env.DERIV_OAUTH_REDIRECT_URI?.trim() || '';

  if (!redirectUri && req) {
    // Derive from incoming request host or APP_URL
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    redirectUri = `${proto}://${host}/api/auth/callback/deriv`;
  } else if (!redirectUri) {
    const appUrl = process.env.APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    redirectUri = `${appUrl}/api/auth/callback/deriv`;
  }

  const isConfigured = Boolean(
    process.env.DERIV_OAUTH_CLIENT_ID && process.env.DERIV_OAUTH_CLIENT_ID.trim().length > 0
  );

  return { clientId, redirectUri, isConfigured };
}

/**
 * Construct the authorization URL for https://auth.deriv.com/oauth2/auth
 * Minimum required scope: 'trade' for autonomous synthetic trading.
 */
export function buildDerivAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  mode: 'login' | 'register';
}): string {
  const search = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    state: params.state,
    scope: 'trade',
  });

  if (params.mode === 'register') {
    search.set('prompt', 'registration');
  }

  return `${DERIV_OAUTH_AUTH_URL}?${search.toString()}`;
}

/**
 * Encrypt the OAuth transaction into an HttpOnly, Secure cookie payload.
 */
export function encryptOAuthTx(tx: OAuthTransaction): string {
  return encryptData(JSON.stringify(tx));
}

/**
 * Decrypt and parse the OAuth transaction from cookie payload.
 */
export function decryptOAuthTx(encrypted: string): OAuthTransaction | null {
  try {
    const raw = decryptData(encrypted);
    const parsed = JSON.parse(raw);
    if (!parsed.state || !parsed.codeVerifier || !parsed.createdAt) {
      return null;
    }
    // Expire transactions older than 15 minutes
    if (Date.now() - parsed.createdAt > 15 * 60 * 1000) {
      return null;
    }
    return parsed as OAuthTransaction;
  } catch (e) {
    console.warn('Failed to decrypt OAuth transaction cookie:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Exchange the authorization code for an access token via POST https://auth.deriv.com/oauth2/token.
 * Uses application/x-www-form-urlencoded as required by the specification.
 */
export async function exchangeCodeForTokens(params: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<DerivTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });

  console.log(`[Deriv OAuth] Exchanging authorization code at ${DERIV_OAUTH_TOKEN_URL} for client ${params.clientId}`);

  const res = await fetch(DERIV_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch (err) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${errText || 'Invalid response'}`);
  }

  if (!res.ok || data.error) {
    const errorMsg = (data.error_description as string) || (data.error as string) || `Token exchange error (HTTP ${res.status})`;
    console.warn(`[Deriv OAuth] Token exchange error response: ${errorMsg}`);
    return {
      access_token: '',
      token_type: '',
      error: (data.error as string) || 'token_exchange_error',
      error_description: errorMsg,
    };
  }

  return {
    access_token: String(data.access_token || ''),
    token_type: String(data.token_type || 'Bearer'),
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
    refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    scope: typeof data.scope === 'string' ? data.scope : 'trade',
  };
}

/**
 * Query Deriv API with the access token to obtain the verified account identity.
 * Combines:
 * 1. REST endpoint: https://api.derivws.com/trading/v1/options/accounts
 * 2. WebSocket authorize: { authorize: accessToken } on wss://...
 * Never trusts client-supplied account IDs.
 */
export async function fetchDerivAccountIdentity(accessToken: string): Promise<DerivResolvedIdentity> {
  if (!accessToken || accessToken.trim().length === 0) {
    throw new Error('Access token is empty.');
  }

  const cleanToken = accessToken.trim();
  let restAccounts: Array<{ id: string; type: 'real' | 'demo'; currency: string; balance: number; isVirtual: boolean }> = [];
  let restError: string | null = null;

  // 1. Try REST endpoint
  try {
    const restUrl = `${DERIV_OAUTH_API_BASE}/trading/v1/options/accounts`;
    const res = await fetch(restUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const json = await res.json();
      const accountsRaw = Array.isArray(json) ? json : json.data || json.accounts || [];
      if (Array.isArray(accountsRaw) && accountsRaw.length > 0) {
        restAccounts = accountsRaw.map((a: Record<string, unknown>) => {
          const accId = String(a.account_id || a.id || a.loginid || '');
          const isDemo = a.type === 'demo' || a.account_type === 'demo' || accId.startsWith('V') || accId.startsWith('DOT');
          return {
            id: accId,
            type: isDemo ? 'demo' : 'real',
            currency: String(a.currency || 'USD'),
            balance: Number(a.balance ?? 0),
            isVirtual: isDemo,
          };
        });
      }
    } else {
      restError = `REST ${res.status}`;
    }
  } catch (e) {
    restError = e instanceof Error ? e.message : String(e);
  }

  // 2. Query WebSocket authorize (authoritative account and user details)
  const wsResult = await new Promise<{
    loginid: string;
    currency: string;
    balance: number;
    isVirtual: boolean;
    email?: string;
    accounts: Array<{ id: string; type: 'real' | 'demo'; currency: string; balance: number; isVirtual: boolean }>;
  } | null>((resolve) => {
    let ws: WebSocket | null = null;
    let timer: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };

    const done = (val: typeof wsResult) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(val);
      }
    };

    timer = setTimeout(() => {
      done(null);
    }, 6000);

    try {
      const url = getDerivWsUrl(DERIV_PRIMARY_HOST);
      ws = new WebSocket(url, DERIV_WS_OPTIONS);

      ws.on('open', () => {
        ws?.send(
          JSON.stringify({
            authorize: cleanToken,
            req_id: 101,
          })
        );
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.error) {
            console.warn('[Deriv WS OAuth Verify] Authorization error:', msg.error.message);
            return done(null);
          }
          if (msg.msg_type === 'authorize' && msg.authorize) {
            const auth = msg.authorize;
            const accountList = auth.account_list || [];
            const accounts = accountList
              .filter((acc: { is_disabled?: number }) => !acc.is_disabled)
              .map((acc: { loginid: string; currency?: string; is_virtual?: number }) => {
                const isVirtual = Boolean(acc.is_virtual);
                return {
                  id: acc.loginid,
                  type: (isVirtual ? 'demo' : 'real') as 'demo' | 'real',
                  currency: acc.currency || 'USD',
                  balance: acc.loginid === auth.loginid ? Number(auth.balance || 0) : 0,
                  isVirtual,
                };
              });

            if (accounts.length === 0) {
              const isVirtual = Boolean(auth.is_virtual);
              accounts.push({
                id: auth.loginid,
                type: isVirtual ? 'demo' : 'real',
                currency: auth.currency || 'USD',
                balance: Number(auth.balance || 0),
                isVirtual,
              });
            }

            done({
              loginid: auth.loginid,
              currency: auth.currency || 'USD',
              balance: Number(auth.balance || 0),
              isVirtual: Boolean(auth.is_virtual),
              email: auth.email,
              accounts,
            });
          }
        } catch {
          done(null);
        }
      });

      ws.on('error', (err) => {
        console.warn('[Deriv WS OAuth Verify] WS error:', err.message);
        done(null);
      });
    } catch {
      done(null);
    }
  });

  if (wsResult) {
    return {
      accountId: wsResult.loginid,
      accountType: wsResult.isVirtual ? 'demo' : 'real',
      currency: wsResult.currency,
      balance: wsResult.balance,
      email: wsResult.email,
      accounts: wsResult.accounts.length > 0 ? wsResult.accounts : restAccounts,
      rawSource: restAccounts.length > 0 ? 'combined' : 'websocket',
    };
  }

  if (restAccounts.length > 0) {
    const primary = restAccounts[0];
    return {
      accountId: primary.id,
      accountType: primary.type,
      currency: primary.currency,
      balance: primary.balance,
      accounts: restAccounts,
      rawSource: 'rest',
    };
  }

  throw new Error(`Failed to verify Deriv account identity through REST or WebSocket (REST error: ${restError || 'none'})`);
}
