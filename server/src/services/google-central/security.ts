import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('Google encryption key must contain 32 bytes.');
  return key;
}
export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export function seal(value: string, key: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}
export function unseal(value: string, key: string, purpose: string): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted credential.');
  const [iv, tag, data] = parts.map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(purpose));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
