import { Router } from 'express';
import { z } from 'zod';
import { q, tx, nowIso, localDate, dayStart, dayEnd } from '../db/index.js';
import { parse, zs, bad, notFound } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { priceMap } from '../services/prices.js';
import { cashMove, cashBalances } from '../services/ledger.js';
import { round2, round3 } from '../lib/gold.js';
import { audit } from '../security/audit.js';

const r = Router();
r.use(guard('cash'));

export const EXPENSE_CATEGORIES = {
  kira: 'Kira', elektrik: 'Elektrik / Su / Doğalgaz', personel: 'Personel (SGK vb.)', vergi: 'Vergi / Muhasebe', guvenlik: 'Güvenlik / Alarm / Sigorta',
  kargo: 'Kargo / Ulaşım', reklam: 'Reklam / Sosyal medya', atolye: 'Atölye malzemesi', mutfak: 'Mutfak / Temizlik', banka: 'Banka / POS komisyonu', diger_gider: 'Diğer gider',
};
export const INCOME_CATEGORIES = { diger_gelir: 'Diğer gelir', sermaye: 'Sermaye girişi', faiz: 'Faiz / Getiri' };

r.get('/meta', (_req, res) => res.json({ expense: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES }));

r.get('/balances', (_req, res) => {
  const prices = priceMap();
  const bal = cashBalances();
  const rate = (c) => (c === 'TRY' ? 1 : c === 'HAS' ? prices.HAS?.buy : prices[c]?.buy) || 0;
  let totalTry = 0;
  for (const acc of Object.values(bal)) for (const [c, v] of Object.entries(acc)) totalTry += v * rate(c);
  res.json({ balances: bal, total_try: round2(totalTry), rates: { HAS: prices.HAS, USD: prices.USD, EUR: prices.EUR, GBP: prices.GBP } });
});

r.get('/movements', (req, res) => {
  const f = parse(z.object({
    from: zs.date.optional(), to: zs.date.optional(), account: z.string().max(10).optional(), currency: z.string().max(4).optional(),
    category: z.string().max(20).optional(), direction: z.enum(['in', 'out']).optional(),
  }), req.query);
  let sql = 'SELECT m.*, u.full_name AS user_name FROM cash_movements m LEFT JOIN users u ON u.id = m.user_id WHERE 1=1';
  const p = [];
  if (f.from) { sql += ' AND m.ts >= ?'; p.push(dayStart(f.from)); }
  if (f.to) { sql += ' AND m.ts <= ?'; p.push(dayEnd(f.to)); }
  for (const k of ['account', 'currency', 'category', 'direction']) if (f[k]) { sql += ` AND m.${k} = ?`; p.push(f[k]); }
  res.json(q.all(`${sql} ORDER BY m.id DESC LIMIT 1000`, ...p));
});

/** Elle gelir / gider kaydı */
r.post('/movements', allow('cash', 'w'), (req, res) => {
  const b = parse(z.object({
    direction: z.enum(['in', 'out']),
    account: z.enum(['kasa', 'banka', 'pos']),
    currency: z.enum(['TRY', 'USD', 'EUR', 'GBP', 'HAS']).default('TRY'),
    amount: z.coerce.number().positive().max(1e10),
    category: z.string().max(20),
    description: zs.optStr(300),
  }), req.body);
  const valid = b.direction === 'out' ? EXPENSE_CATEGORIES : { ...INCOME_CATEGORIES, devir: 'Devir' };
  if (!valid[b.category]) throw bad('Geçersiz kategori');
  const prices = priceMap();
  const rate = b.currency === 'TRY' ? 1 : b.currency === 'HAS' ? prices.HAS.buy : prices[b.currency].buy;
  const id = cashMove(req, { ...b, rate, ref_type: 'manual' });
  audit(req, 'cash.movement', 'cash', id, b);
  res.status(201).json({ id });
});

/** Hatalı elle girilen hareketi iptal (silme yok; iz kalır) */
r.post('/movements/:id/cancel', allow('cash', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const m = q.get('SELECT * FROM cash_movements WHERE id = ?', id);
  if (!m) throw notFound();
  if (m.ref_type !== 'manual') throw bad('Yalnızca elle girilen hareketler iptal edilebilir; satış/alış kaydını ilgili ekrandan iptal edin');
  if (m.cancelled) throw bad('Zaten iptal edilmiş');
  q.run('UPDATE cash_movements SET cancelled = 1 WHERE id = ?', id);
  audit(req, 'cash.movement_cancel', 'cash', id, { amount: m.amount, currency: m.currency });
  res.json({ ok: true });
});

/** Döviz / altın bozdurma: müşteriden döviz al, TL ver (veya tersi) */
r.post('/exchange', allow('cash', 'w'), (req, res) => {
  const b = parse(z.object({
    side: z.enum(['buy', 'sell']), // buy: dükkân dövizi alır; sell: dükkân dövizi satar
    currency: z.enum(['USD', 'EUR', 'GBP']),
    amount: z.coerce.number().positive().max(1e8),
    rate: z.coerce.number().positive().max(1e6).optional(),
  }), req.body);
  const prices = priceMap();
  const rate = b.rate ?? (b.side === 'buy' ? prices[b.currency].buy : prices[b.currency].sell);
  const tl = round2(b.amount * rate);
  tx(() => {
    const desc = `Döviz ${b.side === 'buy' ? 'alış' : 'satış'} ${b.amount} ${b.currency} @ ${rate}`;
    cashMove(req, { direction: b.side === 'buy' ? 'in' : 'out', account: 'kasa', currency: b.currency, amount: b.amount, rate, category: 'doviz', ref_type: 'exchange', description: desc });
    cashMove(req, { direction: b.side === 'buy' ? 'out' : 'in', account: 'kasa', currency: 'TRY', amount: tl, category: 'doviz', ref_type: 'exchange', description: desc });
  });
  audit(req, 'cash.exchange', 'cash', null, { ...b, rate, tl });
  res.status(201).json({ ok: true, tl, rate });
});

/** Kasalar arası virman (ör. POS → banka, kasa → banka) */
r.post('/transfer', allow('cash', 'w'), (req, res) => {
  const b = parse(z.object({
    from: z.enum(['kasa', 'banka', 'pos']), to: z.enum(['kasa', 'banka', 'pos']),
    currency: z.enum(['TRY', 'USD', 'EUR', 'GBP', 'HAS']).default('TRY'),
    amount: z.coerce.number().positive().max(1e10), description: zs.optStr(200),
  }), req.body);
  if (b.from === b.to) throw bad('Kaynak ve hedef aynı olamaz');
  tx(() => {
    cashMove(req, { direction: 'out', account: b.from, currency: b.currency, amount: b.amount, category: 'virman', ref_type: 'transfer', description: b.description || `${b.from} → ${b.to}` });
    cashMove(req, { direction: 'in', account: b.to, currency: b.currency, amount: b.amount, category: 'virman', ref_type: 'transfer', description: b.description || `${b.from} → ${b.to}` });
  });
  audit(req, 'cash.transfer', 'cash', null, b);
  res.status(201).json({ ok: true });
});

/** Gün özeti ve gün sonu kasa sayımı */
r.get('/day', (req, res) => {
  const { date } = parse(z.object({ date: zs.date.default(localDate()) }), req.query);
  const rows = q.all(`SELECT account, currency, category, direction, SUM(amount) AS total, COUNT(*) AS n FROM cash_movements
    WHERE cancelled = 0 AND ts >= ? AND ts <= ? GROUP BY account, currency, category, direction`, dayStart(date), dayEnd(date));
  const closing = q.get('SELECT d.*, u.full_name AS user_name FROM day_closings d LEFT JOIN users u ON u.id = d.user_id WHERE d.date = ?', date);
  res.json({ date, rows, balances: cashBalances(dayEnd(date)), closing: closing && { ...closing, expected: JSON.parse(closing.expected), counted: JSON.parse(closing.counted), diff: JSON.parse(closing.diff) } });
});

r.post('/day-close', allow('cash', 'w'), (req, res) => {
  const b = parse(z.object({
    date: zs.date.default(localDate()),
    counted: z.partialRecord(z.enum(['TRY', 'USD', 'EUR', 'GBP', 'HAS']), z.coerce.number().min(0).max(1e10)),
    note: zs.optStr(500),
  }), req.body);
  if (q.get('SELECT 1 FROM day_closings WHERE date = ?', b.date)) throw bad('Bu gün için kasa zaten kapatılmış');
  const expected = cashBalances(dayEnd(b.date)).kasa || {};
  const diff = {};
  for (const c of new Set([...Object.keys(expected), ...Object.keys(b.counted)])) {
    const d = (b.counted[c] ?? 0) - (expected[c] ?? 0);
    diff[c] = c === 'HAS' ? round3(d) : round2(d);
  }
  q.run('INSERT INTO day_closings(date, expected, counted, diff, note, user_id, ts) VALUES (?,?,?,?,?,?,?)',
    b.date, JSON.stringify(expected), JSON.stringify(b.counted), JSON.stringify(diff), b.note, req.user.id, nowIso());
  audit(req, 'cash.day_close', 'cash', b.date, { diff });
  res.status(201).json({ ok: true, expected, diff });
});

r.get('/closings', (_req, res) => {
  res.json(q.all('SELECT d.*, u.full_name AS user_name FROM day_closings d LEFT JOIN users u ON u.id = d.user_id ORDER BY date DESC LIMIT 90')
    .map((d) => ({ ...d, expected: JSON.parse(d.expected), counted: JSON.parse(d.counted), diff: JSON.parse(d.diff) })));
});

export default r;
