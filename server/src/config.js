import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

// Basit .env okuyucu (bağımlılık eklememek için)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
// Tüm tarih hesapları Türkiye saatine göre yapılır
if (!env.TZ) env.TZ = 'Europe/Istanbul';
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

/**
 * Anahtar yönetimi: Üretimde anahtarlar MUTLAKA ortam değişkeninden gelmeli.
 * Geliştirme/demo ortamında ilk çalıştırmada data/.keys dosyasına üretilir.
 */
function loadKeys() {
  if (env.DATA_ENCRYPTION_KEY && env.INDEX_HMAC_KEY) {
    return { enc: Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64'), hmac: Buffer.from(env.INDEX_HMAC_KEY, 'base64') };
  }
  if (isProd) {
    throw new Error('Üretim ortamında DATA_ENCRYPTION_KEY ve INDEX_HMAC_KEY tanımlanmalıdır (bkz. README).');
  }
  if (isTest) return { enc: crypto.randomBytes(32), hmac: crypto.randomBytes(32) };
  const keyFile = path.join(dataDir, '.keys.json');
  if (!fs.existsSync(keyFile)) {
    fs.writeFileSync(keyFile, JSON.stringify({
      enc: crypto.randomBytes(32).toString('base64'),
      hmac: crypto.randomBytes(32).toString('base64'),
    }), { mode: 0o600 });
    console.warn('[güvenlik] Geliştirme anahtarları üretildi: data/.keys.json — üretimde ortam değişkeni kullanın.');
  }
  const k = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  return { enc: Buffer.from(k.enc, 'base64'), hmac: Buffer.from(k.hmac, 'base64') };
}

const keys = loadKeys();
if (keys.enc.length !== 32 || keys.hmac.length < 32) throw new Error('Şifreleme anahtarları 32 bayt (base64) olmalıdır.');

export const config = {
  isProd,
  isTest,
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  dataDir,
  dbFile: isTest ? ':memory:' : path.join(dataDir, 'kuyumcu.db'),
  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || path.join(dataDir, 'uploads')),
  clientDist: env.CLIENT_DIST ? path.resolve(env.CLIENT_DIST) : path.join(ROOT, 'client', 'dist'),
  keys,
  trustProxy: env.TRUST_PROXY || (isProd ? '1' : false),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  session: {
    idleMinutes: Number(env.SESSION_IDLE_MINUTES || 30),
    absoluteHours: Number(env.SESSION_ABSOLUTE_HOURS || 12),
  },
  login: {
    maxFailures: Number(env.LOGIN_MAX_FAILURES || 5),
    lockMinutes: Number(env.LOGIN_LOCK_MINUTES || 15),
  },
  prices: {
    provider: env.PRICE_PROVIDER || 'truncgil',
    url: env.PRICE_URL || 'https://finans.truncgil.com/today.json',
    refreshSeconds: Number(env.PRICE_REFRESH_SECONDS || 60),
    simulate: env.PRICE_DEMO_SIMULATION === 'true',
  },
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
};
