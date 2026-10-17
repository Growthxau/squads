import fs from 'fs';
import path from 'path';

// Synchronize environment variables from .env
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k && !process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  }
} catch {}

import crypto from 'crypto';
import {
  generatePkcePair,
  generateOAuthState,
  buildDerivAuthUrl,
  encryptOAuthTx,
  decryptOAuthTx,
  DERIV_OAUTH_AUTH_URL,
  OAUTH_TX_COOKIE_NAME,
} from '../lib/deriv/oauth';
import {
  createUser,
  findUserByDerivAccountId,
  findUserById,
  User,
} from '../lib/db';
import {
  createSessionToken,
  verifySessionToken,
  encryptData,
  decryptData,
} from '../lib/crypto';
import { SESSION_COOKIE_NAME } from '../lib/auth';

async function runTestSuite() {
  console.log('====================================================');
  console.log('    G-SQUAD DERIV OAUTH 2.0 PKCE TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // TEST 1: PKCE Cryptography
  console.log('\n--- 1. PKCE Cryptographic Correctness ---');
  const { codeVerifier, codeChallenge } = generatePkcePair();

  assert(
    codeVerifier.length >= 43 && codeVerifier.length <= 128,
    'code_verifier length meets RFC 7636 requirements (43-128 chars)',
    `length was ${codeVerifier.length}`
  );
  assert(
    /^[A-Za-z0-9_-]+$/.test(codeVerifier),
    'code_verifier contains unreserved URL-safe characters only'
  );

  // Manual RFC 7636 S256 verification
  const expectedChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier, 'ascii')
    .digest('base64url');
  assert(
    codeChallenge === expectedChallenge,
    'code_challenge matches BASE64URL(SHA256(ASCII(code_verifier)))'
  );
  assert(
    !codeChallenge.includes('+') && !codeChallenge.includes('/') && !codeChallenge.includes('='),
    'code_challenge is strictly URL-safe with no padding'
  );

  // TEST 2: CSRF State Security
  console.log('\n--- 2. CSRF State Generation ---');
  const state1 = generateOAuthState();
  const state2 = generateOAuthState();
  assert(state1 !== state2, 'Generated states are cryptographically unique');
  assert(state1.length >= 24, 'State has sufficient entropy');
  assert(/^[A-Za-z0-9_-]+$/.test(state1), 'State is URL-safe');

  // TEST 3: Authorization URL Construction
  console.log('\n--- 3. Authorization URL Construction ---');
  const loginUrlStr = buildDerivAuthUrl({
    clientId: '1089',
    redirectUri: 'https://g-squad.vercel.app/api/auth/callback/deriv',
    state: state1,
    codeChallenge,
    mode: 'login',
  });
  const loginUrl = new URL(loginUrlStr);
  assert(
    loginUrl.origin + loginUrl.pathname === DERIV_OAUTH_AUTH_URL,
    'Authorization endpoint is https://auth.deriv.com/oauth2/auth'
  );
  assert(loginUrl.searchParams.get('response_type') === 'code', 'response_type is "code"');
  assert(loginUrl.searchParams.get('client_id') === '1089', 'client_id matches registered ID');
  assert(
    loginUrl.searchParams.get('redirect_uri') === 'https://g-squad.vercel.app/api/auth/callback/deriv',
    'redirect_uri matches exact target callback'
  );
  assert(loginUrl.searchParams.get('code_challenge') === codeChallenge, 'code_challenge included');
  assert(
    loginUrl.searchParams.get('code_challenge_method') === 'S256',
    'code_challenge_method is S256'
  );
  assert(loginUrl.searchParams.get('state') === state1, 'state included');
  assert(loginUrl.searchParams.get('scope') === 'trade', 'scope is strictly minimum "trade"');
  assert(!loginUrl.searchParams.has('prompt'), 'Login mode does NOT include prompt=registration');

  // Registration URL
  const registerUrlStr = buildDerivAuthUrl({
    clientId: '1089',
    redirectUri: 'https://g-squad.vercel.app/api/auth/callback/deriv',
    state: state2,
    codeChallenge,
    mode: 'register',
  });
  const regUrl = new URL(registerUrlStr);
  assert(
    regUrl.searchParams.get('prompt') === 'registration',
    'Registration mode includes prompt=registration'
  );

  // TEST 4: Secure Transaction Cookie Storage
  console.log('\n--- 4. Secure Transaction Cookie Storage & Encryption ---');
  const txPayload = {
    state: state1,
    codeVerifier,
    mode: 'login' as const,
    redirectUri: 'https://g-squad.vercel.app/api/auth/callback/deriv',
    createdAt: Date.now(),
  };
  const encryptedTx = encryptOAuthTx(txPayload);
  assert(typeof encryptedTx === 'string' && encryptedTx.length > 50, 'Transaction encrypted');
  assert(!encryptedTx.includes(codeVerifier), 'Raw code_verifier is never exposed in plaintext');

  const decryptedTx = decryptOAuthTx(encryptedTx);
  assert(decryptedTx !== null, 'Decryption succeeds');
  assert(decryptedTx?.state === state1, 'Decrypted state matches original');
  assert(decryptedTx?.codeVerifier === codeVerifier, 'Decrypted codeVerifier matches original');
  assert(decryptedTx?.mode === 'login', 'Decrypted mode matches original');

  // Corrupted cookie test
  const corrupted = decryptOAuthTx('invalid:corrupted:hex');
  assert(corrupted === null, 'Corrupted or forged transaction cookie safely rejected');

  // Expired cookie test
  const expiredPayload = { ...txPayload, createdAt: Date.now() - 20 * 60 * 1000 };
  const expiredEncrypted = encryptOAuthTx(expiredPayload);
  const expiredDecrypted = decryptOAuthTx(expiredEncrypted);
  assert(expiredDecrypted === null, 'Transaction cookie older than 15 minutes is rejected');

  // TEST 5: Live API Route - OAuth Init Endpoint
  console.log('\n--- 5. Live Endpoint Test: /api/auth/deriv/init ---');
  try {
    const initRes = await fetch('http://127.0.0.1:3000/api/auth/deriv/init?mode=login');
    assert(initRes.status === 200, 'Init endpoint returns HTTP 200');

    const initJson = await initRes.json();
    assert(initJson.success === true, 'Init returns success: true');
    assert(typeof initJson.url === 'string' && initJson.url.startsWith(DERIV_OAUTH_AUTH_URL), 'Returns valid Deriv auth URL');
    assert(typeof initJson.state === 'string', 'Returns CSRF state in response');

    const setCookie = initRes.headers.get('set-cookie');
    assert(Boolean(setCookie && setCookie.includes(OAUTH_TX_COOKIE_NAME)), 'Sets deriv_oauth_tx cookie');
    assert(Boolean(setCookie && setCookie.toLowerCase().includes('httponly')), 'Cookie is HttpOnly');
    assert(Boolean(setCookie && setCookie.toLowerCase().includes('samesite=none')), 'Cookie has SameSite=none for iframes');
  } catch (err: unknown) {
    assert(false, 'Init endpoint reachable', String(err));
  }

  // TEST 6: State Mismatch Detection
  console.log('\n--- 6. State Mismatch Protection ---');
  try {
    // 1. Init to get valid cookie
    const initRes = await fetch('http://127.0.0.1:3000/api/auth/deriv/init?mode=login');
    const cookieHeader = initRes.headers.get('set-cookie')?.split(';')[0];

    // 2. Callback with mismatched state
    const mismatchRes = await fetch(
      'http://127.0.0.1:3000/api/auth/callback/deriv?code=fake_code_123&state=wrong_mismatched_state',
      {
        headers: { Cookie: cookieHeader || '' },
      }
    );
    assert(mismatchRes.status === 400, 'State mismatch returns HTTP 400');
    const html = await mismatchRes.text();
    assert(html.includes('State verification failed') || html.includes('state_mismatch'), 'Displays state mismatch error message');
  } catch (err: unknown) {
    assert(false, 'State mismatch test', String(err));
  }

  // TEST 7: Missing Transaction Cookie / Expired Test
  console.log('\n--- 7. Missing Transaction Cookie Protection ---');
  try {
    const missingCookieRes = await fetch(
      'http://127.0.0.1:3000/api/auth/callback/deriv?code=some_code&state=some_state'
    );
    assert(missingCookieRes.status === 400, 'Missing cookie returns HTTP 400');
    const html = await missingCookieRes.text();
    assert(html.includes('missing_transaction_cookie') || html.includes('expired'), 'Displays transaction expired error');
  } catch (err: unknown) {
    assert(false, 'Missing cookie test', String(err));
  }

  // TEST 8: Provider Error Handling (Denied Consent)
  console.log('\n--- 8. Provider Error Handling (Access Denied / Consent Refused) ---');
  try {
    const errorRes = await fetch(
      'http://127.0.0.1:3000/api/auth/callback/deriv?error=access_denied&error_description=User+denied+trade+permission'
    );
    assert(errorRes.status === 400, 'Provider error returns HTTP 400');
    const html = await errorRes.text();
    assert(html.includes('access_denied'), 'Displays access_denied provider error cleanly');
    assert(html.includes('User denied trade permission'), 'Displays provider description');
  } catch (err: unknown) {
    assert(false, 'Provider error test', String(err));
  }

  // TEST 9: Invalid Code / Token Exchange Error Handling
  console.log('\n--- 9. Token Exchange Error Handling ---');
  try {
    const initRes = await fetch('http://127.0.0.1:3000/api/auth/deriv/init?mode=login');
    const initJson = await initRes.json();
    const cookieHeader = initRes.headers.get('set-cookie')?.split(';')[0];

    const invalidCodeRes = await fetch(
      `http://127.0.0.1:3000/api/auth/callback/deriv?code=invalid_test_code_999&state=${initJson.state}`,
      {
        headers: { Cookie: cookieHeader || '' },
      }
    );
    assert(invalidCodeRes.status === 400, 'Invalid authorization code returns HTTP 400');
    const html = await invalidCodeRes.text();
    assert(
      html.includes('token_exchange') || html.includes('Deriv rejected') || html.includes('failed to exchange'),
      'Safely reports exchange failure without crashing'
    );
  } catch (err: unknown) {
    assert(false, 'Invalid code test', String(err));
  }

  // TEST 10: Session Establishment and User Association
  console.log('\n--- 10. G-Squad User Creation and Session Security ---');
  const mockDerivAccountId = `CR_TEST_${Date.now()}`;
  const mockAccessToken = `oauth_token_simulated_${Date.now()}`;

  // Create test user simulating completed OAuth flow
  const testUserId = `usr_test_${Date.now()}`;
  const now = new Date().toISOString();
  const testUser: User = {
    id: testUserId,
    accountNumber: `GSQ-TEST`,
    email: `${mockDerivAccountId.toLowerCase()}@deriv.oauth`,
    passwordHash: '',
    salt: '',
    isVerified: true,
    verificationCode: '',
    verificationCodeExpiresAt: 0,
    createdAt: now,
    derivConnection: {
      encryptedToken: encryptData(mockAccessToken),
      tokenMask: '••••••••token',
      connectedAccountId: mockDerivAccountId,
      connectedAccountType: 'real',
      connectedCurrency: 'USD',
      balance: 10000,
      accounts: [
        { id: mockDerivAccountId, type: 'real', currency: 'USD', balance: 10000, isVirtual: false },
      ],
      connectedAt: now,
      lastValidatedAt: now,
      oauth: {
        expiresAt: Date.now() + 3600 * 1000,
        scope: 'trade',
        tokenType: 'Bearer',
      },
    },
    botSettings: {
      symbol: 'R_100',
      contractType: 'BOTH',
      durationTicks: 5,
      stake: 5.0,
      maxDailyLoss: 50.0,
      dailyProfitTarget: 100.0,
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

  createUser(testUser);

  const foundByDerivId = findUserByDerivAccountId(mockDerivAccountId);
  assert(foundByDerivId?.id === testUserId, 'User can be located by verified Deriv account ID');
  assert(foundByDerivId?.derivConnection?.connectedAccountId === mockDerivAccountId, 'Deriv account ID preserved');

  // Session Token verification
  const sessionToken = createSessionToken(testUserId);
  const sessionPayload = verifySessionToken(sessionToken);
  assert(sessionPayload?.userId === testUserId, 'Session token signs and verifies user ID correctly');

  // Verify authenticated API call with this session
  try {
    const meRes = await fetch('http://127.0.0.1:3000/api/auth/me', {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });
    assert(meRes.status === 200, 'User with OAuth session can access /api/auth/me');
    const meData = await meRes.json();
    assert(meData.authenticated === true, 'Session is authenticated');
    assert(meData.user?.derivConnection?.connectedAccountId === mockDerivAccountId, 'Connected Deriv ID matches');
  } catch (err: unknown) {
    assert(false, 'Authenticated /api/auth/me check', String(err));
  }

  // TEST 11: Alternative Route /auth/callback
  console.log('\n--- 11. Alternative Callback Route: /auth/callback ---');
  try {
    const altRes = await fetch('http://127.0.0.1:3000/auth/callback?error=access_denied');
    assert(altRes.status === 400, 'Alternative callback route /auth/callback is active and operational');
  } catch (err: unknown) {
    assert(false, 'Alternative callback route check', String(err));
  }

  // Summary
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
