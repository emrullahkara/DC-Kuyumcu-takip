import { config } from '../config.js';
import { COOKIE, loadSession } from '../security/session.js';
import { can } from '../security/permissions.js';
import { safeEqual } from '../security/crypto.js';
import { getSetting } from '../db/index.js';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionLoader(req, _res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  const token = req.cookies[COOKIE];
  const s = loadSession(token);
  if (s) {
    req.session = s;
    req.sessionToken = token;
    req.user = { id: s.user_id, username: s.username, full_name: s.full_name, role: s.role, staff_id: s.staff_id };
  }
  next();
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF koruması: SameSite=Strict çereze ek olarak, durum değiştiren her istekte
 * oturuma bağlı X-CSRF-Token başlığı ve Origin kontrolü zorunludur.
 */
export function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('host');
    const allowed = config.allowedOrigins.includes(origin) || origin === `${req.protocol}://${host}` || origin === `https://${host}` || origin === `http://${host}`;
    if (!allowed) return res.status(403).json({ error: 'Geçersiz kaynak (origin)' });
  }
  if (req.session) {
    const t = req.get('x-csrf-token');
    if (!t || !safeEqual(t, req.session.csrf_token)) return res.status(403).json({ error: 'Güvenlik belirteci geçersiz. Sayfayı yenileyin.' });
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Oturum açmanız gerekiyor' });
  const authPath = req.originalUrl.startsWith('/api/auth');
  if (req.session.must_change_password && !authPath) {
    return res.status(403).json({ error: 'Devam etmeden önce parolanızı değiştirmelisiniz', code: 'MUST_CHANGE_PASSWORD' });
  }
  if (!req.session.totp_enabled && !authPath && (getSetting('business', {}).require_2fa_roles || []).includes(req.user.role)) {
    return res.status(403).json({ error: 'Rolünüz için iki adımlı doğrulama zorunlu. Lütfen kurulumu tamamlayın.', code: 'MFA_SETUP_REQUIRED' });
  }
  next();
}

export const allow = (module, level = 'r') => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Oturum açmanız gerekiyor' });
  if (!can(req.user.role, module, level)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  next();
};

/** GET istekleri için r, diğerleri için w yetkisi ister */
export const guard = (module) => (req, res, next) => allow(module, SAFE.has(req.method) ? 'r' : 'w')(req, res, next);
