import WebSocket from 'ws';
import { DerivAuthorizeResponse, DerivValidationResult } from './types';

export function getDerivAppId(): string {
  const appId = process.env.DERIV_APP_ID;
  if (appId && appId.trim().length > 0) {
    return appId.trim();
  }
  return '1089';
}

export function getDerivWsUrl(): string {
  const appId = getDerivAppId();
  return `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
}

/**
 * Deriv REST OTP Endpoint as documented:
 * POST https://api.derivws.com/trading/v1/options/accounts/{accountId}/otp
 * Headers:
 *   Authorization: Bearer <PAT>
 *   Deriv-App-ID: <appId>
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
 * Validate a user's Deriv Personal Access Token (PAT).
 * Confirms the token is authentic, has 'trade' permission,
 * and retrieves all authorized trading accounts.
 */
export async function validateDerivToken(pat: string): Promise<DerivValidationResult> {
  if (!pat || typeof pat !== 'string' || pat.trim().length < 8) {
    return {
      success: false,
      error: 'Token must be a valid Deriv Personal Access Token (PAT).',
    };
  }

  const cleanPat = pat.trim();

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
      ws = new WebSocket(getDerivWsUrl());

      timer = setTimeout(() => {
        done({
          success: false,
          error: 'Connection to Deriv timed out after 10 seconds. Please check your network.',
        });
      }, 10000);

      ws.on('open', () => {
        // Send authorize request with the PAT
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

            // If account_list is empty, use the authorized account
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
        done({
          success: false,
          error: `Deriv WebSocket connection error: ${err.message}`,
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
 * Fetch the latest live balance for a connected account
 */
export async function fetchLiveBalance(
  pat: string,
  targetAccountId?: string
): Promise<{ balance: number; currency: string } | null> {
  return new Promise((resolve) => {
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
      ws = new WebSocket(getDerivWsUrl());

      timer = setTimeout(() => done(null), 8000);

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
            // If targetAccountId matches, return balance directly
            if (!targetAccountId || auth.loginid === targetAccountId) {
              return done({
                balance: auth.balance,
                currency: auth.currency,
              });
            }
            // Otherwise, balance subscribe
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
}
