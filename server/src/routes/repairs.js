import { Router } from 'express';
import { z } from 'zod';
import { q, tx, nextNo, nowIso } from '../db/index.js';
import { parse, zs, bad, notFound } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { cashMove } from '../services/ledger.js';
import { audit } from '../security/audit.js';

const r = Router();
r.use(guard('repairs'));

const STATUS_FLOW = { alindi: ['atolyede', 'hazir', 'iptal'], atolyede: ['hazir', 'alindi', 'iptal'], hazir: ['teslim', 'atolyede'], teslim: [], iptal: [] };

r.get('/', (req, res) => {
  const f = parse(z.object({ status: z.string().max(12).optional(), q: z.string().max(60).optional(), open: z.string().optional() }), req.query);
  let sql = `SELECT r.*, c.full_name AS customer_name, c.phone AS customer_phone, s.full_name AS staff_name FROM repairs r
    LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN staff s ON s.id = r.assigned_staff_id WHERE 1=1`;
  const p = [];
  if (f.status) { sql += ' AND r.status = ?'; p.push(f.status); }
  if (f.open) sql += " AND r.status IN ('alindi','atolyede','hazir')";
  if (f.q) { sql += ' AND (r.no LIKE ? OR r.item_desc LIKE ? OR c.full_name LIKE ?)'; p.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  res.json(q.all(`${sql} ORDER BY CASE r.status WHEN 'hazir' THEN 0 WHEN 'atolyede' THEN 1 WHEN 'alindi' THEN 2 ELSE 3 END, r.due_date, r.id DESC LIMIT 500`, ...p));
});

r.get('/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const row = q.get(`SELECT r.*, c.full_name AS customer_name, c.phone AS customer_phone, s.full_name AS staff_name FROM repairs r
    LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN staff s ON s.id = r.assigned_staff_id WHERE r.id = ?`, id);
  if (!row) throw notFound();
  res.json({ ...row, payments: q.all("SELECT * FROM cash_movements WHERE ref_type = 'repair' AND ref_id = ? ORDER BY id", id) });
});

const schema = z.object({
  kind: z.enum(['tamir', 'siparis', 'boy', 'temizlik', 'kaplama', 'diger']),
  customer_id: zs.id.nullable().optional(),
  item_desc: zs.str(200).min(2),
  karat: zs.optStr(4),
  gram_in: zs.gram.nullable().optional(),
  issue: zs.optStr(1000),
  estimated_price: zs.money.default(0),
  due_date: zs.date.nullable().optional().or(z.literal('')),
  assigned_staff_id: zs.id.nullable().optional(),
  photo: z.string().max(200).regex(/^\/uploads\/[A-Za-z0-9._-]+$/).nullable().optional(),
  note: zs.optStr(1000),
});

r.post('/', (req, res) => {
  const b = parse(schema.extend({ deposit: zs.money.default(0), deposit_account: z.enum(['kasa', 'pos', 'banka']).default('kasa') }), req.body);
  const ts = nowIso();
  const result = tx(() => {
    const no = nextNo('T');
    const id = q.run(`INSERT INTO repairs(no, kind, customer_id, item_desc, karat, gram_in, issue, estimated_price, deposit, due_date, assigned_staff_id, photo, note, created_at, updated_at, user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, no, b.kind, b.customer_id ?? null, b.item_desc, b.karat, b.gram_in ?? null, b.issue, b.estimated_price, b.deposit,
    b.due_date || null, b.assigned_staff_id ?? null, b.photo ?? null, b.note, ts, ts, req.user.id).lastInsertRowid;
    if (b.deposit > 0) cashMove(req, { direction: 'in', account: b.deposit_account, currency: 'TRY', amount: b.deposit, category: 'tamir', ref_type: 'repair', ref_id: id, description: `${no} kapora` });
    return { id, no };
  });
  audit(req, 'repair.create', 'repair', result.id, { no: result.no, kind: b.kind, gram_in: b.gram_in });
  res.status(201).json(result);
});

r.put('/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(schema, req.body);
  const row = q.get('SELECT * FROM repairs WHERE id = ?', id);
  if (!row) throw notFound();
  if (['teslim', 'iptal'].includes(row.status)) throw bad('Kapanmış iş emri düzenlenemez');
  q.run(`UPDATE repairs SET kind = ?, customer_id = ?, item_desc = ?, karat = ?, gram_in = ?, issue = ?, estimated_price = ?, due_date = ?, assigned_staff_id = ?,
    photo = ?, note = ?, updated_at = ? WHERE id = ?`, b.kind, b.customer_id ?? null, b.item_desc, b.karat, b.gram_in ?? null, b.issue, b.estimated_price,
  b.due_date || null, b.assigned_staff_id ?? null, b.photo ?? row.photo, b.note, nowIso(), id);
  audit(req, 'repair.update', 'repair', id);
  res.json({ ok: true });
});

r.post('/:id/status', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(z.object({
    status: z.enum(['alindi', 'atolyede', 'hazir', 'teslim', 'iptal']),
    final_price: zs.money.optional(),
    gram_out: zs.gram.optional(),
    account: z.enum(['kasa', 'pos', 'banka']).default('kasa'),
    refund_deposit: zs.bool.optional(),
    note: zs.optStr(300),
  }), req.body);
  const row = q.get('SELECT * FROM repairs WHERE id = ?', id);
  if (!row) throw notFound();
  if (!STATUS_FLOW[row.status].includes(b.status)) throw bad(`"${row.status}" durumundan "${b.status}" durumuna geçilemez`);
  tx(() => {
    const ts = nowIso();
    if (b.status === 'teslim') {
      const final = b.final_price ?? row.estimated_price;
      const remaining = Math.max(0, final - row.deposit);
      if (remaining > 0) cashMove(req, { direction: 'in', account: b.account, currency: 'TRY', amount: remaining, category: 'tamir', ref_type: 'repair', ref_id: id, description: `${row.no} teslim tahsilatı` });
      q.run('UPDATE repairs SET status = ?, final_price = ?, delivered_at = ?, updated_at = ?, note = COALESCE(?, note) WHERE id = ?', 'teslim', final, ts, ts, b.note ?? null, id);
    } else {
      if (b.status === 'iptal' && b.refund_deposit && row.deposit > 0) {
        cashMove(req, { direction: 'out', account: 'kasa', currency: 'TRY', amount: row.deposit, category: 'tamir', ref_type: 'repair', ref_id: id, description: `${row.no} kapora iadesi` });
      }
      q.run('UPDATE repairs SET status = ?, updated_at = ?, note = COALESCE(?, note) WHERE id = ?', b.status, ts, b.note ?? null, id);
    }
  });
  audit(req, 'repair.status', 'repair', id, { from: row.status, to: b.status, final_price: b.final_price, gram_out: b.gram_out });
  res.json({ ok: true });
});

export default r;
