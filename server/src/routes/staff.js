import { Router } from 'express';
import { z } from 'zod';
import { q, tx, nowIso, localDate, dayStart, dayEnd } from '../db/index.js';
import { parse, zs, bad, notFound } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { encrypt, maskTCKN, isValidTCKN } from '../security/crypto.js';
import { cashMove } from '../services/ledger.js';
import { round2 } from '../lib/gold.js';
import { audit } from '../security/audit.js';

const r = Router();

// Mesai: her kullanıcı kendi giriş/çıkışını yapabilir
r.post('/me/check', (req, res) => {
  if (!req.user.staff_id) throw bad('Hesabınız bir personel kaydına bağlı değil');
  const b = parse(z.object({ action: z.enum(['in', 'out']) }), req.body);
  const date = localDate();
  const time = new Date().toTimeString().slice(0, 5);
  const row = q.get('SELECT * FROM staff_attendance WHERE staff_id = ? AND date = ?', req.user.staff_id, date);
  if (b.action === 'in') {
    if (row?.check_in) throw bad(`Bugün ${row.check_in} saatinde giriş yapılmış`);
    q.run('INSERT INTO staff_attendance(staff_id, date, check_in) VALUES (?,?,?)', req.user.staff_id, date, time);
  } else {
    if (!row?.check_in) throw bad('Önce giriş yapmalısınız');
    q.run('UPDATE staff_attendance SET check_out = ? WHERE id = ?', time, row.id);
  }
  audit(req, `staff.check_${b.action}`, 'staff', req.user.staff_id, { time });
  res.json({ ok: true, time });
});

r.get('/me/today', (req, res) => {
  if (!req.user.staff_id) return res.json(null);
  res.json(q.get('SELECT * FROM staff_attendance WHERE staff_id = ? AND date = ?', req.user.staff_id, localDate()) || {});
});

r.use(guard('staff'));

r.get('/', (req, res) => {
  const month = localDate().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const from = dayStart(`${month}-01`);
  const to = dayEnd(localDate(new Date(y, m, 0)));
  res.json(q.all(`SELECT s.id, s.full_name, s.phone, s.position, s.tckn_masked, s.start_date, s.salary, s.commission_pct, s.active, s.notes,
    (SELECT COALESCE(SUM(total),0) FROM sales x WHERE x.staff_id = s.id AND x.status = 'tamam' AND x.ts BETWEEN ? AND ?) AS month_sales,
    (SELECT COUNT(*) FROM sales x WHERE x.staff_id = s.id AND x.status = 'tamam' AND x.ts BETWEEN ? AND ?) AS month_sale_count,
    (SELECT check_in FROM staff_attendance a WHERE a.staff_id = s.id AND a.date = ?) AS today_in,
    (SELECT check_out FROM staff_attendance a WHERE a.staff_id = s.id AND a.date = ?) AS today_out,
    (SELECT u.username FROM users u WHERE u.staff_id = s.id LIMIT 1) AS username
    FROM staff s ORDER BY s.active DESC, s.full_name`, from, to, from, to, localDate(), localDate()));
});

r.get('/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const s = q.get('SELECT id, full_name, phone, position, tckn_masked, start_date, salary, commission_pct, active, notes FROM staff WHERE id = ?', id);
  if (!s) throw notFound();
  const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).default(localDate().slice(0, 7)) }), req.query);
  const [y, m] = month.split('-').map(Number);
  const from = dayStart(`${month}-01`);
  const to = dayEnd(localDate(new Date(y, m, 0)));
  const sales = q.get("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(total - cost_total),0) AS gross FROM sales WHERE staff_id = ? AND status = 'tamam' AND ts BETWEEN ? AND ?", id, from, to);
  const tr = q.all('SELECT t.*, u.full_name AS user_name FROM staff_transactions t LEFT JOIN users u ON u.id = t.user_id WHERE t.staff_id = ? ORDER BY t.id DESC LIMIT 100', id);
  const attendance = q.all('SELECT * FROM staff_attendance WHERE staff_id = ? AND date LIKE ? ORDER BY date DESC', id, `${month}%`);
  const monthTr = q.all('SELECT type, SUM(amount) AS total FROM staff_transactions WHERE staff_id = ? AND period = ? GROUP BY type', id, month);
  const sum = Object.fromEntries(monthTr.map((t) => [t.type, t.total]));
  const commission = round2((sales.total * s.commission_pct) / 100);
  res.json({
    ...s, month, sales, attendance, transactions: tr,
    payroll: {
      salary: s.salary, commission, advances: sum.avans || 0, bonuses: sum.prim || 0, deductions: sum.kesinti || 0, paid_salary: sum.maas || 0,
      net_due: round2(s.salary + commission + (sum.prim || 0) - (sum.avans || 0) - (sum.kesinti || 0) - (sum.maas || 0)),
    },
  });
});

const schema = z.object({
  full_name: zs.str(100).min(2), phone: zs.phone.optional().nullable(), position: zs.optStr(60), tckn: z.string().trim().optional().nullable(),
  iban: z.string().trim().max(34).regex(/^(TR\d{24})?$/, 'IBAN TR ile başlayan 26 karakter olmalı').optional().nullable(),
  start_date: zs.date.optional().nullable().or(z.literal('')), salary: zs.money.default(0), commission_pct: z.coerce.number().min(0).max(50).default(0),
  active: zs.bool.default(true), notes: zs.optStr(1000),
});

r.post('/', (req, res) => {
  const b = parse(schema, req.body);
  if (b.tckn && !isValidTCKN(b.tckn)) throw bad('TC kimlik numarası geçersiz');
  const id = q.run(`INSERT INTO staff(full_name, phone, position, tckn_enc, tckn_masked, iban_enc, start_date, salary, commission_pct, active, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, b.full_name, b.phone || null, b.position, encrypt(b.tckn), maskTCKN(b.tckn), encrypt(b.iban), b.start_date || null,
  b.salary, b.commission_pct, b.active ? 1 : 0, b.notes).lastInsertRowid;
  audit(req, 'staff.create', 'staff', id, { full_name: b.full_name });
  res.status(201).json({ id });
});

r.put('/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(schema, req.body);
  if (b.tckn && !isValidTCKN(b.tckn)) throw bad('TC kimlik numarası geçersiz');
  const before = q.get('SELECT * FROM staff WHERE id = ?', id);
  if (!before) throw notFound();
  q.run(`UPDATE staff SET full_name = ?, phone = ?, position = ?, start_date = ?, salary = ?, commission_pct = ?, active = ?, notes = ?,
    tckn_enc = COALESCE(?, tckn_enc), tckn_masked = COALESCE(?, tckn_masked), iban_enc = COALESCE(?, iban_enc) WHERE id = ?`,
  b.full_name, b.phone || null, b.position, b.start_date || null, b.salary, b.commission_pct, b.active ? 1 : 0, b.notes,
  encrypt(b.tckn), maskTCKN(b.tckn), encrypt(b.iban), id);
  audit(req, 'staff.update', 'staff', id, { salary: [before.salary, b.salary] });
  res.json({ ok: true });
});

r.post('/:id/transactions', allow('staff', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(z.object({
    type: z.enum(['maas', 'avans', 'prim', 'kesinti']),
    amount: z.coerce.number().positive().max(1e8),
    period: z.string().regex(/^\d{4}-\d{2}$/).default(localDate().slice(0, 7)),
    account: z.enum(['kasa', 'banka']).default('banka'),
    note: zs.optStr(300),
  }), req.body);
  const s = q.get('SELECT full_name FROM staff WHERE id = ?', id);
  if (!s) throw notFound();
  tx(() => {
    const tid = q.run('INSERT INTO staff_transactions(staff_id, ts, type, amount, period, note, user_id) VALUES (?,?,?,?,?,?,?)', id, nowIso(), b.type, b.amount, b.period, b.note, req.user.id).lastInsertRowid;
    // Kesinti dışında her hareket kasadan/bankadan çıkış demektir
    if (b.type !== 'kesinti') {
      cashMove(req, { direction: 'out', account: b.account, currency: 'TRY', amount: b.amount, category: 'personel', ref_type: 'staff', ref_id: tid, description: `${s.full_name} — ${b.type} (${b.period})` });
    }
  });
  audit(req, `staff.${b.type}`, 'staff', id, { amount: b.amount, period: b.period });
  res.status(201).json({ ok: true });
});

r.put('/:id/attendance', allow('staff', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(z.object({
    date: zs.date, check_in: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), check_out: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), note: zs.optStr(200),
  }), req.body);
  q.run(`INSERT INTO staff_attendance(staff_id, date, check_in, check_out, note) VALUES (?,?,?,?,?)
    ON CONFLICT(staff_id, date) DO UPDATE SET check_in = excluded.check_in, check_out = excluded.check_out, note = excluded.note`,
  id, b.date, b.check_in ?? null, b.check_out ?? null, b.note);
  audit(req, 'staff.attendance_edit', 'staff', id, b);
  res.json({ ok: true });
});

export default r;
