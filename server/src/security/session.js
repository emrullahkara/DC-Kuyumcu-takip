import { q, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { randomToken, sha256 } from './crypto.js';

export const COOKIE = config.cookieSecure ? '__Host-kt_sid' : 'kt_sid';

export function createSession(userId, req) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + config.session.absoluteHours * 3600_000);
  q.run(
    'INSERT INTO sessions(id, user_id, csrf_token, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)',
    sha256(token), userId, csrf, now.toISOString(), now.toISOString(), expires.toISOString(), req.ip, String(req.get('user-agent') || '').slice(0, 200),
  );
  return { token, csrf, expires };
}

export function cookieOptions(expires) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    expires,
  };
}

/** Oturumu doğrular; boşta kalma süresi ve mutlak süre kontrol edilir. */
export function loadSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const id = sha256(token);
  const s = q.get(
    `SELECT s.*, u.username, u.full_name, u.role, u.active, u.must_change_password, u.totp_enabled, u.staff_id
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, id,
  );
  if (!s) return null;
  const now = Date.now();
  const idleLimit = new Date(s.last_seen_at).getTime() + config.session.idleMinutes * 60_000;
  if (!s.active || now > new Date(s.expires_at).getTime() || now > idleLimit) {
    q.run('DELETE FROM sessions WHERE id = ?', id);
    return null;
  }
  // Her istekte değil, en fazla 30 sn'de bir güncelle
  if (now - new Date(s.last_seen_at).getTime() > 30_000) {
    q.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', nowIso(), id);
  }
  return s;
}

export function destroySession(token) {
  if (token) q.run('DELETE FROM sessions WHERE id = ?', sha256(token));
}

export function destroyUserSessions(userId, exceptId = null) {
  if (exceptId) q.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', userId, exceptId);
  else q.run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function purgeExpired() {
  const now = nowIso();
  q.run('DELETE FROM sessions WHERE expires_at < ?', now);
  q.run('DELETE FROM mfa_challenges WHERE expires_at < ?', now);
}
