import { Router } from 'express';
import { z } from 'zod';
import { q, nowIso, getSetting } from '../db/index.js';
import { config } from '../config.js';
import { asyncH, parse, bad } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword, verifyPassword, passwordProblems } from '../security/password.js';
import { createSession, cookieOptions, destroySession, destroyUserSessions, COOKIE } from '../security/session.js';
import { encrypt, decrypt, randomToken, sha256 } from '../security/crypto.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../security/totp.js';
import { permissionsFor, ROLES } from '../security/permissions.js';
import { rateLimit } from '../security/rateLimit.js';
import { audit } from '../security/audit.js';

const r = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: config.isTest ? 1000 : 20, message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' });

// Zamanlama saldırılarına karşı: kullanıcı yoksa da parola doğrulaması kadar süre harcanır
const DUMMY_HASH = await hashPassword(randomToken(16));

function me(req) {
  const u = q.get('SELECT id, username, full_name, role, totp_enabled, must_change_password, staff_id, last_login_at FROM users WHERE id = ?', req.user.id);
  return {
    user: { ...u, role_label: ROLES[u.role] },
    permissions: permissionsFor(u.role),
    csrf: req.session.csrf_token,
    site: getSetting('site')?.name,
  };
}

function startSession(req, res, user) {
  const { token, csrf, expires } = createSession(user.id, req);
  q.run('UPDATE users SET failed_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', nowIso(), user.id);
  res.cookie(COOKIE, token, cookieOptions(expires));
  return csrf;
}

r.post('/login', loginLimiter, asyncH(async (req, res) => {
  const body = parse(z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) }), req.body);
  const user = q.get('SELECT * FROM users WHERE username = ?', body.username);
  const genericError = 'Kullanıcı adı veya parola hatalı';

  if (!user) {
    await verifyPassword(body.password, DUMMY_HASH);
    audit(req, 'login.fail', 'user', null, { username: body.username, reason: 'unknown' });
    return res.status(401).json({ error: genericError });
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    audit(req, 'login.locked', 'user', user.id, { username: user.username });
    return res.status(423).json({ error: 'Hesap geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin veya yöneticinize başvurun.' });
  }
  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok || !user.active) {
    const failed = user.failed_count + 1;
    const lock = failed >= config.login.maxFailures ? new Date(Date.now() + config.login.lockMinutes * 60_000).toISOString() : null;
    q.run('UPDATE users SET failed_count = ?, locked_until = ? WHERE id = ?', lock ? 0 : failed, lock, user.id);
    audit(req, lock ? 'login.lock' : 'login.fail', 'user', user.id, { username: user.username });
    return res.status(401).json({ error: genericError });
  }

  const business = getSetting('business', {});
  if (user.totp_enabled) {
    const challenge = randomToken(24);
    q.run('INSERT INTO mfa_challenges(id, user_id, expires_at) VALUES (?,?,?)', sha256(challenge), user.id, new Date(Date.now() + 5 * 60_000).toISOString());
    return res.json({ mfa: true, challenge });
  }
  if ((business.require_2fa_roles || []).includes(user.role)) {
    // 2FA zorunlu rol: oturum açılır ama yalnızca 2FA kurulumu yapılabilir
    const csrf = startSession(req, res, user);
    audit(req, 'login.ok', 'user', user.id, { username: user.username, mfaSetupRequired: true });
    return res.json({ ok: true, csrf, mfaSetupRequired: true });
  }
  const csrf = startSession(req, res, user);
  audit(req, 'login.ok', 'user', user.id, { username: user.username });
  res.json({ ok: true, csrf, mustChangePassword: !!user.must_change_password });
}));

r.post('/login/mfa', loginLimiter, asyncH(async (req, res) => {
  const body = parse(z.object({ challenge: z.string().min(10).max(100), code: z.string().trim().max(10) }), req.body);
  const ch = q.get('SELECT * FROM mfa_challenges WHERE id = ?', sha256(body.challenge));
  if (!ch || new Date(ch.expires_at) < new Date() || ch.attempts >= 5) {
    if (ch) q.run('DELETE FROM mfa_challenges WHERE id = ?', ch.id);
    return res.status(401).json({ error: 'Doğrulama süresi doldu. Lütfen yeniden giriş yapın.' });
  }
  const user = q.get('SELECT * FROM users WHERE id = ?', ch.user_id);
  const counter = verifyTotp(decrypt(user.totp_secret_enc), body.code);
  // Aynı kodun tekrar kullanılmasını engelle (replay)
  if (counter === null || (user.totp_last_counter !== null && counter <= user.totp_last_counter)) {
    q.run('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?', ch.id);
    audit(req, 'login.mfa_fail', 'user', user.id, { username: user.username });
    return res.status(401).json({ error: 'Doğrulama kodu hatalı' });
  }
  q.run('DELETE FROM mfa_challenges WHERE id = ?', ch.id);
  q.run('UPDATE users SET totp_last_counter = ? WHERE id = ?', counter, user.id);
  const csrf = startSession(req, res, user);
  audit(req, 'login.ok', 'user', user.id, { username: user.username, mfa: true });
  res.json({ ok: true, csrf, mustChangePassword: !!user.must_change_password });
}));

r.post('/logout', (req, res) => {
  if (req.user) audit(req, 'logout', 'user', req.user.id);
  destroySession(req.sessionToken);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json(me(req)));

r.post('/password', requireAuth, asyncH(async (req, res) => {
  const body = parse(z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }), req.body);
  const user = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!(await verifyPassword(body.current, user.password_hash))) throw bad('Mevcut parola hatalı');
  const problems = passwordProblems(body.next, user.username);
  if (problems.length) throw bad(`Parola uygun değil: ${problems.join(', ')}`);
  if (await verifyPassword(body.next, user.password_hash)) throw bad('Yeni parola eskisiyle aynı olamaz');
  q.run('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ? WHERE id = ?', await hashPassword(body.next), nowIso(), user.id);
  destroyUserSessions(user.id, req.session.id); // diğer cihazlardaki oturumları kapat
  audit(req, 'user.password_change', 'user', user.id);
  res.json({ ok: true });
}));

// --- İki adımlı doğrulama (TOTP) ---
r.post('/2fa/setup', requireAuth, (req, res) => {
  const user = q.get('SELECT username, totp_enabled FROM users WHERE id = ?', req.user.id);
  if (user.totp_enabled) throw bad('İki adımlı doğrulama zaten açık');
  const secret = generateSecret();
  q.run('UPDATE users SET totp_secret_enc = ? WHERE id = ?', encrypt(secret), req.user.id);
  res.json({ secret, otpauth: otpauthUrl(secret, user.username, getSetting('site')?.name || 'DC Kuyumcu') });
});

r.post('/2fa/enable', requireAuth, (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().max(10) }), req.body);
  const user = q.get('SELECT totp_secret_enc FROM users WHERE id = ?', req.user.id);
  if (!user.totp_secret_enc) throw bad('Önce kurulum başlatın');
  const counter = verifyTotp(decrypt(user.totp_secret_enc), code);
  if (counter === null) throw bad('Kod hatalı. Telefonunuzdaki saatin doğru olduğundan emin olun.');
  q.run('UPDATE users SET totp_enabled = 1, totp_last_counter = ? WHERE id = ?', counter, req.user.id);
  audit(req, 'user.2fa_enable', 'user', req.user.id);
  res.json({ ok: true });
});

r.post('/2fa/disable', requireAuth, asyncH(async (req, res) => {
  const { password, code } = parse(z.object({ password: z.string().min(1).max(200), code: z.string().trim().max(10) }), req.body);
  const user = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!(await verifyPassword(password, user.password_hash))) throw bad('Parola hatalı');
  if (!user.totp_enabled || verifyTotp(decrypt(user.totp_secret_enc), code) === null) throw bad('Kod hatalı');
  if ((getSetting('business', {}).require_2fa_roles || []).includes(user.role)) throw bad('Rolünüz için iki adımlı doğrulama zorunludur');
  q.run('UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_counter = NULL WHERE id = ?', user.id);
  audit(req, 'user.2fa_disable', 'user', user.id);
  res.json({ ok: true });
}));

// --- Oturumlarım ---
r.get('/sessions', requireAuth, (req, res) => {
  const rows = q.all('SELECT id, created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC', req.user.id);
  res.json(rows.map((s) => ({ ...s, id: s.id.slice(0, 12), current: s.id === req.session.id })));
});

r.post('/sessions/revoke-others', requireAuth, (req, res) => {
  destroyUserSessions(req.user.id, req.session.id);
  audit(req, 'user.sessions_revoke', 'user', req.user.id);
  res.json({ ok: true });
});

export default r;
