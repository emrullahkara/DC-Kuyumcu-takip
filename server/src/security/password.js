import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const COMMON = new Set(['123456', '12345678', '123456789', 'password', 'qwerty', 'sifre123', 'parola123', 'kuyumcu', 'admin123', '11111111']);

/** Parola politikası: en az 10 karakter, harf + rakam, yaygın parolalar yasak. */
export function passwordProblems(pw, username = '') {
  const problems = [];
  if (typeof pw !== 'string' || pw.length < 10) problems.push('En az 10 karakter olmalı');
  if (!/[a-zçğıöşü]/i.test(pw || '')) problems.push('En az bir harf içermeli');
  if (!/[0-9]/.test(pw || '')) problems.push('En az bir rakam içermeli');
  if (COMMON.has(String(pw).toLowerCase())) problems.push('Çok yaygın bir parola');
  if (username && String(pw).toLowerCase().includes(String(username).toLowerCase())) problems.push('Kullanıcı adını içermemeli');
  return problems;
}
