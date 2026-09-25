import { Router } from 'express';
import { z } from 'zod';
import { q, tx, nowIso } from '../db/index.js';
import { parse, zs, bad, notFound } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { encrypt, decrypt, blindIndex, maskTCKN, isValidTCKN } from '../security/crypto.js';
import { priceMap } from '../services/prices.js';
import { balances, cashMove, customerEntry } from '../services/ledger.js';
import { round2 } from '../lib/gold.js';
import { audit } from '../security/audit.js';

const r = Router();

const LIST_COLS = `c.id, c.full_name, c.phone, c.email, c.tckn_masked, c.birth_date, c.anniversary_date, c.tags, c.kvkk_consent,
  c.marketing_consent, c.anonymized, c.created_at`;

r.get('/', guard('customers'), (req, res) => {
  const f = parse(z.object({ q: z.string().trim().max(60).optional(), debtors: z.string().optional() }), req.query);
  let sql = `SELECT ${LIST_COLS},
    (SELECT COALESCE(SUM(amount),0) FROM customer_ledger l WHERE l.customer_id = c.id AND l.currency = 'TRY') AS balance_try,
    (SELECT COALESCE(SUM(amount),0) FROM customer_ledger l WHERE l.customer_id = c.id AND l.currency = 'HAS') AS balance_has,
    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'tamam') AS sale_count,
    (SELECT COALESCE(SUM(total),0) FROM sales s WHERE s.customer_id = c.id AND s.status = 'tamam') AS sale_total
    FROM customers c WHERE c.anonymized = 0`;
  const p = [];
  if (f.q) {
    // TC kimlik no ile arama kör indeks üzerinden yapılır (şifreli veri açılmaz)
    if (/^\d{11}$/.test(f.q)) { sql += ' AND c.tckn_index = ?'; p.push(blindIndex(f.q)); }
    else { sql += ' AND (c.full_name LIKE ? OR c.phone LIKE ?)'; p.push(`%${f.q}%`, `%${f.q.replace(/\s/g, '')}%`); }
  }
  sql += ' ORDER BY c.full_name COLLATE NOCASE LIMIT 500';
  let rows = q.all(sql, ...p).map((c) => ({ ...c, balance_try: round2(c.balance_try), balance_has: Math.round(c.balance_has * 1000) / 1000 }));
  if (f.debtors) rows = rows.filter((c) => Math.abs(c.balance_try) > 0.009 || Math.abs(c.balance_has) > 0.0009);
  res.json(rows);
});

/** Yaklaşan doğum günü / evlilik yıldönümü hatırlatmaları (satış fırsatı) */
r.get('/reminders/upcoming', guard('customers'), (req, res) => {
  const days = 14;
  const today = new Date();
  const rows = q.all('SELECT id, full_name, phone, birth_date, anniversary_date, marketing_consent FROM customers WHERE anonymized = 0 AND (birth_date IS NOT NULL OR anniversary_date IS NOT NULL)');
  const out = [];
  for (const c of rows) {
    for (const [type, d] of [['Doğum günü', c.birth_date], ['Evlilik yıldönümü', c.anniversary_date]]) {
      if (!d) continue;
      const [, m, day] = d.split('-').map(Number);
      const next = new Date(today.getFullYear(), m - 1, day);
      if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next.setFullYear(today.getFullYear() + 1);
      const inDays = Math.round((next - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400_000);
      if (inDays <= days) out.push({ id: c.id, full_name: c.full_name, phone: c.phone, type, date: d, in_days: inDays, marketing_consent: !!c.marketing_consent });
    }
  }
  res.json(out.sort((a, b) => a.in_days - b.in_days));
});

r.get('/:id', guard('customers'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const c = q.get(`SELECT ${LIST_COLS}, c.address, c.notes, c.kvkk_consent_at FROM customers c WHERE c.id = ?`, id);
  if (!c) throw notFound();
  const ledger = q.all('SELECT l.*, u.full_name AS user_name FROM customer_ledger l LEFT JOIN users u ON u.id = l.user_id WHERE customer_id = ? ORDER BY l.id DESC LIMIT 300', id);
  const sales = q.all('SELECT id, no, ts, total, status FROM sales WHERE customer_id = ? ORDER BY id DESC LIMIT 100', id);
  const purchases = q.all('SELECT id, no, ts, kind, total, has_total FROM purchases WHERE customer_id = ? ORDER BY id DESC LIMIT 100', id);
  const repairs = q.all('SELECT id, no, kind, item_desc, status, due_date, created_at FROM repairs WHERE customer_id = ? ORDER BY id DESC LIMIT 100', id);
  res.json({ ...c, balances: balances('customer_ledger', 'customer_id', id), ledger, sales, purchases, repairs });
});

/** TC kimlik numarasını açık göster — yalnızca patron/müdür, her görüntüleme kayda geçer */
r.get('/:id/tckn', allow('customers', 'w'), (req, res) => {
  if (!['owner', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Bu bilgiyi yalnızca patron ve müdür görebilir' });
  const id = parse(zs.id, req.params.id);
  const c = q.get('SELECT tckn_enc FROM customers WHERE id = ?', id);
  if (!c) throw notFound();
  audit(req, 'customer.tckn_view', 'customer', id);
  res.json({ tckn: decrypt(c.tckn_enc) });
});

const schema = z.object({
  full_name: zs.str(100).min(2),
  phone: zs.phone.optional().nullable(),
  email: z.string().trim().email('geçersiz e-posta').max(120).optional().nullable().or(z.literal('')),
  tckn: z.string().trim().optional().nullable(),
  birth_date: zs.date.optional().nullable().or(z.literal('')),
  anniversary_date: zs.date.optional().nullable().or(z.literal('')),
  address: zs.optStr(300),
  notes: zs.optStr(1000),
  tags: zs.optStr(200),
  kvkk_consent: zs.bool.default(false),
  marketing_consent: zs.bool.default(false),
});

function prepare(b) {
  if (b.tckn && !isValidTCKN(b.tckn)) throw bad('TC kimlik numarası geçersiz');
  return { ...b, email: b.email || null, birth_date: b.birth_date || null, anniversary_date: b.anniversary_date || null };
}

r.post('/', allow('customers', 'w'), (req, res) => {
  const b = prepare(parse(schema, req.body));
  if (b.tckn && q.get('SELECT id FROM customers WHERE tckn_index = ?', blindIndex(b.tckn))) throw bad('Bu TC kimlik numarasıyla kayıtlı müşteri var');
  const id = q.run(`INSERT INTO customers(full_name, phone, email, tckn_enc, tckn_index, tckn_masked, birth_date, anniversary_date, address, notes, tags,
    kvkk_consent, kvkk_consent_at, marketing_consent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  b.full_name, b.phone || null, b.email, encrypt(b.tckn), blindIndex(b.tckn), maskTCKN(b.tckn), b.birth_date, b.anniversary_date, b.address, b.notes, b.tags,
  b.kvkk_consent ? 1 : 0, b.kvkk_consent ? nowIso() : null, b.marketing_consent ? 1 : 0).lastInsertRowid;
  audit(req, 'customer.create', 'customer', id, { full_name: b.full_name });
  res.status(201).json({ id });
});

r.put('/:id', allow('customers', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const before = q.get('SELECT * FROM customers WHERE id = ?', id);
  if (!before || before.anonymized) throw notFound();
  const b = prepare(parse(schema, req.body));
  let tcSql = '';
  const tcParams = [];
  if (b.tckn) {
    const dup = q.get('SELECT id FROM customers WHERE tckn_index = ? AND id <> ?', blindIndex(b.tckn), id);
    if (dup) throw bad('Bu TC kimlik numarasıyla kayıtlı başka müşteri var');
    tcSql = ', tckn_enc = ?, tckn_index = ?, tckn_masked = ?';
    tcParams.push(encrypt(b.tckn), blindIndex(b.tckn), maskTCKN(b.tckn));
  }
  q.run(`UPDATE customers SET full_name = ?, phone = ?, email = ?, birth_date = ?, anniversary_date = ?, address = ?, notes = ?, tags = ?,
    kvkk_consent = ?, kvkk_consent_at = ?, marketing_consent = ?${tcSql} WHERE id = ?`,
  b.full_name, b.phone || null, b.email, b.birth_date, b.anniversary_date, b.address, b.notes, b.tags, b.kvkk_consent ? 1 : 0,
  b.kvkk_consent ? (before.kvkk_consent_at || nowIso()) : null, b.marketing_consent ? 1 : 0, ...tcParams, id);
  audit(req, 'customer.update', 'customer', id, { tckn_changed: !!b.tckn });
  res.json({ ok: true });
});

/** KVKK — unutulma hakkı: kişisel veriler silinir, mali kayıtlar anonim olarak korunur */
r.post('/:id/anonymize', allow('customers', 'w'), (req, res) => {
  if (!['owner', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Yalnızca patron ve müdür yapabilir' });
  const id = parse(zs.id, req.params.id);
  const bal = balances('customer_ledger', 'customer_id', id);
  if (Object.values(bal).some((v) => Math.abs(v) > 0.001)) throw bad('Açık bakiyesi olan müşteri anonimleştirilemez');
  q.run(`UPDATE customers SET full_name = ?, phone = NULL, email = NULL, tckn_enc = NULL, tckn_index = NULL, tckn_masked = NULL, birth_date = NULL,
    anniversary_date = NULL, address = NULL, notes = NULL, tags = NULL, marketing_consent = 0, anonymized = 1 WHERE id = ?`, `Anonim Müşteri #${id}`, id);
  audit(req, 'customer.anonymize', 'customer', id);
  res.json({ ok: true });
});

/** Tahsilat / ödeme / düzeltme: cari bakiye hareketleri */
r.post('/:id/ledger', allow('customers', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(z.object({
    type: z.enum(['tahsilat', 'odeme', 'duzeltme', 'emanet']),
    currency: z.enum(['TRY', 'HAS', 'USD', 'EUR']),
    amount: z.coerce.number().positive().max(1e10),
    account: z.enum(['kasa', 'banka', 'pos']).default('kasa'),
    direction: z.enum(['borc', 'alacak']).optional(), // yalnızca düzeltme için
    note: zs.optStr(300),
  }), req.body);
  if (!q.get('SELECT 1 FROM customers WHERE id = ? AND anonymized = 0', id)) throw notFound();
  if (b.type === 'duzeltme' && !['owner', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Cari düzeltme yalnızca patron/müdür tarafından yapılabilir' });
  const prices = priceMap();
  const rate = b.currency === 'TRY' ? 1 : b.currency === 'HAS' ? prices.HAS.buy : prices[b.currency].buy;
  tx(() => {
    if (b.type === 'tahsilat') {
      // Müşteri borcunu öder: cari azalır, kasa artar
      customerEntry(req, { customer_id: id, type: 'tahsilat', currency: b.currency, amount: -b.amount, note: b.note });
      cashMove(req, { direction: 'in', account: b.currency === 'TRY' ? b.account : 'kasa', currency: b.currency, amount: b.amount, rate, category: 'tahsilat', ref_type: 'customer', ref_id: id, description: b.note || 'Cari tahsilat' });
    } else if (b.type === 'odeme') {
      // Müşteriye olan borcumuzu öderiz
      customerEntry(req, { customer_id: id, type: 'odeme', currency: b.currency, amount: b.amount, note: b.note });
      cashMove(req, { direction: 'out', account: b.currency === 'TRY' ? b.account : 'kasa', currency: b.currency, amount: b.amount, rate, category: 'odeme', ref_type: 'customer', ref_id: id, description: b.note || 'Müşteriye ödeme' });
    } else if (b.type === 'emanet') {
      // Müşterinin bize bıraktığı emanet altın/para (biz borçlanırız)
      customerEntry(req, { customer_id: id, type: 'emanet', currency: b.currency, amount: -b.amount, note: b.note || 'Emanet' });
      cashMove(req, { direction: 'in', account: 'kasa', currency: b.currency, amount: b.amount, rate, category: 'emanet', ref_type: 'customer', ref_id: id, description: b.note || 'Emanet alındı' });
    } else {
      customerEntry(req, { customer_id: id, type: 'duzeltme', currency: b.currency, amount: b.direction === 'alacak' ? -b.amount : b.amount, note: b.note });
    }
  });
  audit(req, `customer.ledger.${b.type}`, 'customer', id, b);
  res.status(201).json({ ok: true, balances: balances('customer_ledger', 'customer_id', id) });
});

export default r;
