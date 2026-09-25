import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { q, db, getSetting, setSetting, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { parse, zs, bad, notFound, asyncH } from '../middleware/validate.js';
import { allow, guard } from '../middleware/auth.js';
import { hashPassword, passwordProblems } from '../security/password.js';
import { destroyUserSessions } from '../security/session.js';
import { ROLES, MODULES, permissionsFor } from '../security/permissions.js';
import { audit, verifyAuditChain } from '../security/audit.js';
import { randomToken } from '../security/crypto.js';
import { DEFAULT_SITE } from '../db/base.js';

const r = Router();

// ---------- Güvenli dosya yükleme ----------
fs.mkdirSync(config.uploadDir, { recursive: true });
const SIGNATURES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/** Yalnızca gerçek JPEG/PNG/WEBP kabul edilir (uzantıya değil dosya imzasına bakılır); SVG/HTML reddedilir. */
function saveImage(file) {
  if (!file) throw bad('Dosya seçin');
  const sig = SIGNATURES.find((s) => s.test(file.buffer));
  if (!sig) throw bad('Yalnızca JPG, PNG veya WEBP görsel yüklenebilir');
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${sig.ext}`;
  fs.writeFileSync(path.join(config.uploadDir, name), file.buffer, { mode: 0o640 });
  return `/uploads/${name}`;
}

r.post('/uploads', allow('dashboard'), upload.single('file'), (req, res) => {
  const p = saveImage(req.file);
  audit(req, 'upload', 'file', p, { size: req.file.size });
  res.status(201).json({ path: p });
});

// ---------- Web sitesi yönetimi ----------
r.get('/site', guard('site'), (_req, res) => {
  res.json({ settings: { ...DEFAULT_SITE, ...getSetting('site', {}) }, images: q.all('SELECT * FROM site_images ORDER BY kind, sort, id') });
});

const siteSchema = z.object({
  name: zs.str(80).min(2), slogan: zs.optStr(160), founded_year: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
  phone: zs.optStr(30), whatsapp: z.string().trim().regex(/^\d{0,15}$/, 'yalnızca rakam, ülke koduyla (90...)').optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal('')), instagram: z.string().trim().regex(/^[A-Za-z0-9._]{0,30}$/).optional().nullable(),
  facebook: zs.optStr(80), address: zs.optStr(300), map_query: zs.optStr(200),
  hours: z.array(z.object({ day: zs.str(40), time: zs.str(40) })).max(10).default([]),
  about_title: zs.optStr(160), about_text: zs.optStr(5000),
  values: z.array(z.object({ title: zs.str(60), text: zs.str(200) })).max(8).default([]),
  hero_title: zs.optStr(160), hero_text: zs.optStr(300),
  show_prices: z.array(z.string().max(20)).max(30).default([]), price_note: zs.optStr(300), theme: z.enum(['gold', 'dark', 'rose']).default('gold'),
});

r.put('/site', allow('site', 'w'), (req, res) => {
  const b = parse(siteSchema, req.body);
  setSetting('site', { ...getSetting('site', {}), ...b });
  audit(req, 'site.update', 'site', null);
  res.json({ ok: true });
});

r.post('/site/images', allow('site', 'w'), upload.single('file'), (req, res) => {
  const b = parse(z.object({ kind: z.enum(['logo', 'hero', 'about', 'gallery']), caption: zs.optStr(160) }), req.body);
  const p = saveImage(req.file);
  if (b.kind === 'logo') q.run("DELETE FROM site_images WHERE kind = 'logo'");
  const id = q.run('INSERT INTO site_images(kind, path, caption, sort) VALUES (?,?,?,?)', b.kind, p, b.caption, Date.now() % 100000).lastInsertRowid;
  audit(req, 'site.image_add', 'site_image', id, { kind: b.kind });
  res.status(201).json({ id, path: p });
});

r.delete('/site/images/:id', allow('site', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const img = q.get('SELECT * FROM site_images WHERE id = ?', id);
  if (!img) throw notFound();
  q.run('DELETE FROM site_images WHERE id = ?', id);
  const file = path.join(config.uploadDir, path.basename(img.path));
  if (img.path.startsWith('/uploads/') && fs.existsSync(file)) fs.unlinkSync(file);
  audit(req, 'site.image_delete', 'site_image', id);
  res.json({ ok: true });
});

// ---------- Web talepleri ----------
r.get('/inquiries', guard('inquiries'), (_req, res) => {
  res.json(q.all(`SELECT i.id, i.ts, i.name, i.phone, i.message, i.status, i.product_id, p.name AS product_name FROM inquiries i
    LEFT JOIN products p ON p.id = i.product_id ORDER BY CASE i.status WHEN 'yeni' THEN 0 ELSE 1 END, i.id DESC LIMIT 300`));
});
r.put('/inquiries/:id', allow('inquiries', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const { status } = parse(z.object({ status: z.enum(['yeni', 'arandi', 'kapandi']) }), req.body);
  q.run('UPDATE inquiries SET status = ? WHERE id = ?', status, id);
  audit(req, 'inquiry.status', 'inquiry', id, { status });
  res.json({ ok: true });
});

// ---------- Kullanıcılar ----------
r.get('/users', guard('users'), (_req, res) => {
  res.json({
    roles: ROLES, modules: MODULES, matrix: Object.fromEntries(Object.keys(ROLES).map((k) => [k, permissionsFor(k)])),
    users: q.all(`SELECT u.id, u.username, u.full_name, u.role, u.active, u.totp_enabled, u.must_change_password, u.last_login_at, u.locked_until, u.staff_id,
      s.full_name AS staff_name, (SELECT COUNT(*) FROM sessions x WHERE x.user_id = u.id) AS session_count FROM users u LEFT JOIN staff s ON s.id = u.staff_id ORDER BY u.id`),
  });
});

const userSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, '3-30 karakter; harf, rakam, . _ -'),
  full_name: zs.str(80).min(2),
  role: z.enum(['owner', 'manager', 'sales', 'accountant', 'workshop']),
  staff_id: zs.id.nullable().optional(),
});

function onlyOwnerCanTouchOwner(req, role) {
  if (role === 'owner' && req.user.role !== 'owner') throw Object.assign(new Error('Patron hesabını yalnızca patron yönetebilir'), { status: 403 });
}

r.post('/users', allow('users', 'w'), asyncH(async (req, res) => {
  const b = parse(userSchema, req.body);
  onlyOwnerCanTouchOwner(req, b.role);
  if (q.get('SELECT 1 FROM users WHERE username = ?', b.username)) throw bad('Bu kullanıcı adı alınmış');
  const temp = `${randomToken(6)}${Math.floor(Math.random() * 90 + 10)}`;
  const id = q.run('INSERT INTO users(username, full_name, role, password_hash, must_change_password, staff_id, password_changed_at) VALUES (?,?,?,?,1,?,?)',
    b.username, b.full_name, b.role, await hashPassword(temp), b.staff_id ?? null, nowIso()).lastInsertRowid;
  audit(req, 'user.create', 'user', id, { username: b.username, role: b.role });
  res.status(201).json({ id, temp_password: temp });
}));

r.put('/users/:id', allow('users', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(userSchema.omit({ username: true }).extend({ active: zs.bool.default(true) }), req.body);
  const u = q.get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  onlyOwnerCanTouchOwner(req, u.role);
  onlyOwnerCanTouchOwner(req, b.role);
  if (u.role === 'owner' && (b.role !== 'owner' || !b.active) && q.get("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1").n <= 1) {
    throw bad('Sistemde en az bir aktif patron hesabı kalmalı');
  }
  q.run('UPDATE users SET full_name = ?, role = ?, staff_id = ?, active = ? WHERE id = ?', b.full_name, b.role, b.staff_id ?? null, b.active ? 1 : 0, id);
  if (!b.active || b.role !== u.role) destroyUserSessions(id);
  audit(req, 'user.update', 'user', id, { role: [u.role, b.role], active: b.active });
  res.json({ ok: true });
});

r.post('/users/:id/reset', allow('users', 'w'), asyncH(async (req, res) => {
  const id = parse(zs.id, req.params.id);
  const u = q.get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  onlyOwnerCanTouchOwner(req, u.role);
  const b = parse(z.object({ password: z.string().max(200).optional(), reset_2fa: zs.bool.default(false) }), req.body || {});
  const temp = b.password || `${randomToken(6)}${Math.floor(Math.random() * 90 + 10)}`;
  if (b.password) {
    const pr = passwordProblems(b.password, u.username);
    if (pr.length) throw bad(`Parola uygun değil: ${pr.join(', ')}`);
  }
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_count = 0, locked_until = NULL, password_changed_at = ?
    ${b.reset_2fa ? ', totp_enabled = 0, totp_secret_enc = NULL, totp_last_counter = NULL' : ''} WHERE id = ?`, await hashPassword(temp), nowIso(), id);
  destroyUserSessions(id);
  audit(req, 'user.reset_password', 'user', id, { reset_2fa: b.reset_2fa });
  res.json({ ok: true, temp_password: b.password ? undefined : temp });
}));

r.post('/users/:id/revoke', allow('users', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  destroyUserSessions(id);
  audit(req, 'user.sessions_revoke', 'user', id);
  res.json({ ok: true });
});

// ---------- Denetim kaydı ----------
r.get('/audit', guard('audit'), (req, res) => {
  const f = parse(z.object({ q: z.string().max(60).optional(), user: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(1000).default(300) }), req.query);
  let sql = 'SELECT id, ts, user_id, username, action, entity, entity_id, detail, ip FROM audit_log WHERE 1=1';
  const p = [];
  if (f.q) { sql += ' AND (action LIKE ? OR entity LIKE ? OR detail LIKE ?)'; p.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  if (f.user) { sql += ' AND username = ?'; p.push(f.user); }
  res.json(q.all(`${sql} ORDER BY id DESC LIMIT ?`, ...p, f.limit));
});
r.get('/audit/verify', guard('audit'), (_req, res) => res.json(verifyAuditChain()));

// ---------- İşletme ayarları ----------
r.get('/settings', guard('settings'), (_req, res) => res.json(getSetting('business', {})));
r.put('/settings', allow('settings', 'w'), (req, res) => {
  const b = parse(z.object({
    identity_threshold_try: zs.money, max_discount_pct_sales: z.coerce.number().min(0).max(50), price_rounding: z.coerce.number().int().min(1).max(100),
    default_fire_pct: z.coerce.number().min(0).max(20), require_2fa_roles: z.array(z.enum(['owner', 'manager', 'sales', 'accountant', 'workshop'])).default([]),
    cancel_roles: z.array(z.enum(['owner', 'manager', 'sales', 'accountant'])).min(1), receipt_footer: zs.optStr(300),
  }), req.body);
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'İşletme ayarlarını yalnızca patron değiştirebilir' });
  const before = getSetting('business', {});
  setSetting('business', { ...before, ...b });
  audit(req, 'settings.update', 'settings', null, { before, after: b });
  res.json({ ok: true });
});

// ---------- Yedekleme ----------
r.get('/backup', allow('settings', 'w'), (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Yedeği yalnızca patron indirebilir' });
  const tmp = path.join(config.dataDir, `yedek-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  audit(req, 'backup.download', 'system', null);
  res.download(tmp, `kuyumcu-yedek-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(tmp, { force: true }, () => {}));
});

export default r;
