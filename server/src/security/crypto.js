import crypto from 'node:crypto';
import { config } from '../config.js';

/** AES-256-GCM ile alan şifreleme (TC kimlik no, 2FA sırrı gibi hassas veriler). */
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.keys.enc, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(payload) {
  if (!payload) return null;
  const [v, iv, tag, ct] = String(payload).split(':');
  if (v !== 'v1') throw new Error('Bilinmeyen şifreleme sürümü');
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.keys.enc, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

/** Şifreli alanda arama yapabilmek için kör indeks (HMAC). */
export function blindIndex(value) {
  if (!value) return null;
  return crypto.createHmac('sha256', config.keys.hmac).update(String(value).trim()).digest('hex');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** TC kimlik numarası algoritma doğrulaması */
export function isValidTCKN(tc) {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

export function maskTCKN(tc) {
  if (!tc) return null;
  return `${tc.slice(0, 3)}******${tc.slice(-2)}`;
}
