/**
 * Server-side environment diagnostics and validation.
 * NEVER exposes variable values - returns variable names and presence status only.
 */

export interface EnvStatus {
  allConfigured: boolean;
  missingVariables: string[];
  configuredVariables: string[];
  smtp: {
    configured: boolean;
    missing: string[];
    hostConfigured: boolean;
    portConfigured: boolean;
    userConfigured: boolean;
    passConfigured: boolean;
    fromConfigured: boolean;
  };
  security: {
    sessionSecretConfigured: boolean;
    encryptionKeyConfigured: boolean;
    missing: string[];
  };
  deriv: {
    appIdConfigured: boolean;
    appId: string;
    oauthClientIdConfigured: boolean;
    oauthRedirectUriConfigured: boolean;
    oauthConfigured: boolean;
  };
}

export function getEnvironmentStatus(): EnvStatus {
  const requiredSmtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const optionalSmtp = ['SMTP_PORT', 'SMTP_FROM'];
  const securityVars = ['SESSION_SECRET', 'ENCRYPTION_KEY'];

  const missingSmtp: string[] = [];
  if (!process.env.SMTP_HOST) missingSmtp.push('SMTP_HOST');
  if (!process.env.SMTP_USER) missingSmtp.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missingSmtp.push('SMTP_PASS');

  const missingSecurity: string[] = [];
  if (!process.env.SESSION_SECRET) missingSecurity.push('SESSION_SECRET');
  if (!process.env.ENCRYPTION_KEY) missingSecurity.push('ENCRYPTION_KEY');

  const allKnown = [
    'DERIV_APP_ID',
    'DERIV_OAUTH_CLIENT_ID',
    'DERIV_OAUTH_REDIRECT_URI',
    'SESSION_SECRET',
    'ENCRYPTION_KEY',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
  ];

  const configuredVariables: string[] = [];
  const missingVariables: string[] = [];

  for (const v of allKnown) {
    if (process.env[v] && process.env[v]!.trim().length > 0) {
      configuredVariables.push(v);
    } else {
      missingVariables.push(v);
    }
  }

  const smtpConfigured = missingSmtp.length === 0;

  return {
    allConfigured: missingVariables.length === 0,
    missingVariables,
    configuredVariables,
    smtp: {
      configured: smtpConfigured,
      missing: missingSmtp,
      hostConfigured: Boolean(process.env.SMTP_HOST),
      portConfigured: Boolean(process.env.SMTP_PORT),
      userConfigured: Boolean(process.env.SMTP_USER),
      passConfigured: Boolean(process.env.SMTP_PASS),
      fromConfigured: Boolean(process.env.SMTP_FROM),
    },
    security: {
      sessionSecretConfigured: Boolean(process.env.SESSION_SECRET),
      encryptionKeyConfigured: Boolean(process.env.ENCRYPTION_KEY),
      missing: missingSecurity,
    },
    deriv: {
      appIdConfigured: Boolean(process.env.DERIV_APP_ID),
      appId: process.env.DERIV_APP_ID || '1089',
      oauthClientIdConfigured: Boolean(process.env.DERIV_OAUTH_CLIENT_ID),
      oauthRedirectUriConfigured: Boolean(process.env.DERIV_OAUTH_REDIRECT_URI),
      oauthConfigured: Boolean(process.env.DERIV_OAUTH_CLIENT_ID),
    },
  };
}
