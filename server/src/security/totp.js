import crypto from 'node:crypto';

// RFC 4648 Base32 ve RFC 6238 TOTP — Google Authenticator / Microsoft Authenticator uyumlu
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Geçersiz base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export function totp(secret, time = Date.now(), step = 30) {
  return hotp(secret, Math.floor(time / 1000 / step));
}

/** ±1 adım saat kaymasına izin verir. Eşleşen sayaç değerini döner (tekrar kullanımı engellemek için). */
export function verifyTotp(secret, code, time = Date.now(), step = 30) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const counter = Math.floor(time / 1000 / step);
  for (const w of [0, -1, 1]) {
    const c = counter + w;
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, c)), Buffer.from(String(code)))) return c;
  }
  return null;
}

export function otpauthUrl(secret, account, issuer = 'DC Kuyumcu Takip') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
