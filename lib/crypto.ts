import crypto from 'crypto';

// Default fallback key if ENCRYPTION_KEY is not supplied in .env
// Uses SHA-256 hash of SESSION_SECRET or a deterministic server salt
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.trim().length > 0) {
    const trimmed = envKey.trim();
    // If it's a 64-char hex string, convert from hex; else take sha256 to produce 32 bytes
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    return crypto.createHash('sha256').update(trimmed).digest();
  }
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret.trim().length > 0) {
    return crypto.createHash('sha256').update(`deriv-pat-secret-${sessionSecret.trim()}`).digest();
  }
  throw new Error('Missing ENCRYPTION_KEY or SESSION_SECRET environment variable.');
}

/**
 * Encrypt sensitive data (like Deriv PAT) using AES-256-GCM
 */
export function encryptData(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive data using AES-256-GCM
 */
export function decryptData(cipherText: string): string {
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid cipher text format');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt token securely');
  }
}

/**
 * Secure password hashing with PBKDF2
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

/**
 * Generate unique G-Squad Account ID (e.g., GSQ-610063)
 */
export function generateGSquadAccountId(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `GSQ-${num}`;
}

/**
 * Generate 6-digit numeric verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Mask token for safe UI display (e.g. ••••••••abcd)
 */
export function maskToken(token: string): string {
  if (!token) return '';
  const visibleLen = Math.min(4, Math.floor(token.length / 4));
  const maskedSection = '•'.repeat(Math.max(8, token.length - visibleLen));
  const endSection = token.slice(-visibleLen);
  return `${maskedSection}${endSection}`;
}

/**
 * Create a signed session token
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }
  return 'g-squad-session-secret-2026';
}

/**
 * Create a signed session token
 */
export function createSessionToken(userId: string): string {
  const secret = getSessionSecret();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Verify a signed session token
 */
export function verifySessionToken(token: string): { userId: string } | null {
  try {
    const secret = getSessionSecret();
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.userId || !data.expiresAt || data.expiresAt < Date.now()) {
      return null;
    }
    return { userId: data.userId };
  } catch {
    return null;
  }
}
