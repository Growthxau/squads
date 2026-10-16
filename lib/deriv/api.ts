import WebSocket from 'ws';
import { DerivAuthorizeResponse, DerivValidationResult } from './types';

export function getDerivAppId(): string {
  const appId = process.env.DERIV_APP_ID;
  if (appId && appId.trim().length > 0) {
    return appId.trim();
  }
  return '1089';
}

export const DERIV_PRIMARY_HOST = 'red.derivws.com';

export const DERIV_CLUSTERS = [
  'red.derivws.com',
  'frontend.derivws.com',
  'blue.derivws.com',
];

export const DERIV_WS_OPTIONS: WebSocket.ClientOptions = {
  family: 4,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Origin: 'https://app.deriv.com',
  },
  handshakeTimeout: 8000,
};

export function getDerivWsUrl(host?: string): string {
  const appId = getDerivAppId();
  const endpoint = host || process.env.DERIV_WS_HOST || DERIV_PRIMARY_HOST;
  return `wss://${endpoint}/websockets/v3?app_id=${appId}`;
}

/**
 * Deriv REST OTP Endpoint
 */
export async function requestAccountOtp(
  pat: string,
  accountId: string
): Promise<{ otp?: string; websocketUrl?: string; error?: string }> {
  try {
    const appId = getDerivAppId();
    const url = `https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Deriv-App-ID': appId,
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        otp: data.otp || data.token,
        websocketUrl: data.websocket_url || data.ws_url,
      };
    } else {
      const errText = await res.text();
      console.warn(`Deriv OTP endpoint returned ${res.status}:`, errText);
      return { error: `OTP service response: ${res.status}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Deriv OTP REST call failed:', message);
    return { error: message };
  }
}

/**
 * Test authentication on a single cluster
 */
function tryValidateOnCluster(cleanPat: string, cluster: string): Promise<DerivValidationResult> {
  return new Promise<DerivValidationResult>((resolve) => {
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

    const done = (result: DerivValidationResult) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    try {
      const url = getDerivWsUrl(cluster);
      console.log(`[Deriv WS] Connecting to ${url}...`);
      ws = new WebSocket(url, DERIV_WS_OPTIONS);

      timer = setTimeout(() => {
        console.warn(`[Deriv WS] Timeout on ${cluster}`);
        done({
          success: false,
          error: `Connection to Deriv (${cluster}) timed out.`,
        });
      }, 7000);

      ws.on('open', () => {
        console.log(`[Deriv WS] Successfully opened connection to ${cluster}!`);
        ws?.send(
          JSON.stringify({
            authorize: cleanPat,
            req_id: 1,
          })
        );
      });

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.error) {
            return done({
              success: false,
              error: msg.error.message || 'Invalid Deriv Personal Access Token.',
            });
          }

          if (msg.msg_type === 'authorize' && msg.authorize) {
            const auth: DerivAuthorizeResponse = msg.authorize;

            // Verify 'trade' scope requirement
            const scopes = auth.scopes || [];
            const hasTradeScope = scopes.some(
              (s) => s.toLowerCase() === 'trade' || s.toLowerCase() === 'trading_information'
            );

            if (!hasTradeScope) {
              return done({
                success: false,
                error:
                  "This token does not have the required 'trade' permission. Please generate a new token at https://home.deriv.com/dashboard/profile with the Trade checkbox enabled.",
              });
            }

            // Map all trading accounts
            const accountList = auth.account_list || [];
            const accounts = accountList
              .filter((acc) => !acc.is_disabled)
              .map((acc) => {
                const isVirtual = Boolean(acc.is_virtual);
                return {
                  id: acc.loginid,
                  type: (isVirtual ? 'demo' : 'real') as 'demo' | 'real',
                  currency: acc.currency || 'USD',
                  balance: acc.loginid === auth.loginid ? auth.balance : 0,
                  isVirtual,
                };
              });

            if (accounts.length === 0) {
              const isVirtual = Boolean(auth.is_virtual);
              accounts.push({
                id: auth.loginid,
                type: isVirtual ? 'demo' : 'real',
                currency: auth.currency || 'USD',
                balance: auth.balance,
                isVirtual,
              });
            }

            done({
              success: true,
              details: {
                loginid: auth.loginid,
                currency: auth.currency,
                balance: auth.balance,
                isVirtual: Boolean(auth.is_virtual),
                scopes: auth.scopes,
                accounts,
              },
            });
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          done({
            success: false,
            error: `Failed to parse response from Deriv: ${message}`,
          });
        }
      });

      ws.on('error', (err: Error) => {
        console.warn(`[Deriv WS] Error on ${cluster}:`, err.message);
        done({
          success: false,
          error: `Deriv WebSocket connection error (${cluster}): ${err.message}`,
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      done({
        success: false,
        error: `Failed to initiate Deriv connection: ${message}`,
      });
    }
  });
}

/**
 * Validate a user's Deriv Personal Access Token (PAT) across available clusters.
 */
export async function validateDerivToken(pat: string): Promise<DerivValidationResult> {
  if (!pat || typeof pat !== 'string' || pat.trim().length < 8) {
    return {
      success: false,
      error: 'Token must be a valid Deriv Personal Access Token (PAT).',
    };
  }

  const cleanPat = pat.trim();
  const clusters = [
    process.env.DERIV_WS_HOST,
    DERIV_PRIMARY_HOST,
    'frontend.derivws.com',
  ].filter(Boolean) as string[];

  let lastError = 'Failed to connect to Deriv API clusters.';

  for (const cluster of clusters) {
    const result = await tryValidateOnCluster(cleanPat, cluster);
    if (result.success) {
      return result;
    }
    // If it's a specific token validation error from Deriv (e.g. Invalid token, missing scope), return directly
    if (
      result.error &&
      !result.error.includes('connection error') &&
      !result.error.includes('520') &&
      !result.error.includes('timed out')
    ) {
      return result;
    }
    lastError = result.error || lastError;
  }

  return {
    success: false,
    error: lastError,
  };
}

/**
 * Fetch the latest live balance for a connected account
 */
export async function fetchLiveBalance(
  pat: string,
  targetAccountId?: string
): Promise<{ balance: number; currency: string } | null> {
  const clusters = [
    process.env.DERIV_WS_HOST,
    DERIV_PRIMARY_HOST,
    'frontend.derivws.com',
  ].filter(Boolean) as string[];

  for (const cluster of clusters) {
    const res = await new Promise<{ balance: number; currency: string } | null>((resolve) => {
      let ws: WebSocket | null = null;
      let timer: NodeJS.Timeout | null = null;
      let finished = false;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (ws) {
          try {
            ws.close();
          } catch {}
        }
      };

      const done = (val: { balance: number; currency: string } | null) => {
        if (!finished) {
          finished = true;
          cleanup();
          resolve(val);
        }
      };

      try {
        ws = new WebSocket(getDerivWsUrl(cluster), DERIV_WS_OPTIONS);

        timer = setTimeout(() => done(null), 5000);

        ws.on('open', () => {
          ws?.send(
            JSON.stringify({
              authorize: pat,
              req_id: 1,
            })
          );
        });

        ws.on('message', (data: WebSocket.RawData) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.error) {
              return done(null);
            }
            if (msg.msg_type === 'authorize' && msg.authorize) {
              const auth = msg.authorize;
              if (!targetAccountId || auth.loginid === targetAccountId) {
                return done({
                  balance: auth.balance,
                  currency: auth.currency,
                });
              }
              ws?.send(
                JSON.stringify({
                  balance: 1,
                  account: targetAccountId,
                  req_id: 2,
                })
              );
            } else if (msg.msg_type === 'balance' && msg.balance) {
              return done({
                balance: msg.balance.balance,
                currency: msg.balance.currency,
              });
            }
          } catch {
            done(null);
          }
        });

        ws.on('error', () => done(null));
      } catch {
        done(null);
      }
    });

    if (res !== null) {
      return res;
    }
  }

  return null;
}
