import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function comparePasswords(password: string, hash: string): boolean {
  if (!hash || typeof hash !== 'string' || !hash.includes(':')) return false;
  try {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return false;
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(derivedKey, Buffer.from(key, 'hex'));
  } catch (err) {
    console.error("[AUTH] Password comparison error:", err);
    return false;
  }
}
