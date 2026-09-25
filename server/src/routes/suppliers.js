import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/index.js';
import { parse, zs, notFound } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { priceMap } from '../services/prices.js';
import { balances, cashMove, supplierEntry } from '../services/ledger.js';
import { audit } from '../security/audit.js';

const r = Router();
r.use(guard('suppliers'));

r.get('/', (_req, res) => {
  res.json(q.all(`SELECT s.*,
    (SELECT COALESCE(SUM(amount),0) FROM supplier_ledger l WHERE l.supplier_id = s.id AND currency = 'HAS') AS balance_has,
    (SELECT COALESCE(SUM(amount),0) FROM supplier_ledger l WHERE l.supplier_id = s.id AND currency = 'TRY') AS balance_try
    FROM suppliers s WHERE s.active = 1 ORDER BY s.name`));
});

r.get('/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const s = q.get('SELECT * FROM suppliers WHERE id = ?', id);
  if (!s) throw notFound();
  res.json({
    ...s,
    balances: balances('supplier_ledger', 'supplier_id', id),
    ledger: q.all('SELECT l.*, u.full_name AS user_name FROM supplier_ledger l LEFT JOIN users u ON u.id = l.user_id WHERE supplier_id = ? ORDER BY l.id DESC LIMIT 300', id),
    products: q.all('SELECT id, sku, name, stock_qty FROM products WHERE supplier_id = ? AND active = 1 ORDER BY name LIMIT 200', id),
  });
});

const schema = z.object({
  name: zs.str(120).min(2), contact: zs.optStr(80), phone: zs.phone.optional().nullable(), address: zs.optStr(300), notes: zs.optStr(1000),
});

r.post('/', (req, res) => {
  const b = parse(schema, req.body);
  const id = q.run('INSERT INTO suppliers(name, contact, phone, address, notes) VALUES (?,?,?,?,?)', b.name, b.contact, b.phone || null, b.address, b.notes).lastInsertRowid;
  audit(req, 'supplier.create', 'supplier', id, { name: b.name });
  res.status(201).json({ id });
});

r.put('/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(schema, req.body);
  q.run('UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, notes = ? WHERE id = ?', b.name, b.contact, b.phone || null, b.address, b.notes, id);
  audit(req, 'supplier.update', 'supplier', id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  q.run('UPDATE suppliers SET active = 0 WHERE id = ?', id);
  audit(req, 'supplier.deactivate', 'supplier', id);
  res.json({ ok: true });
});

/** Tedarikçiye ödeme (has altın veya para) */
r.post('/:id/payment', allow('suppliers', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(z.object({
    currency: z.enum(['TRY', 'HAS', 'USD', 'EUR']),
    amount: z.coerce.number().positive().max(1e10),
    account: z.enum(['kasa', 'banka']).default('kasa'),
    note: zs.optStr(300),
  }), req.body);
  const s = q.get('SELECT * FROM suppliers WHERE id = ?', id);
  if (!s) throw notFound();
  const prices = priceMap();
  const rate = b.currency === 'TRY' ? 1 : b.currency === 'HAS' ? prices.HAS.buy : prices[b.currency].sell;
  tx(() => {
    supplierEntry(req, { supplier_id: id, type: 'odeme', currency: b.currency, amount: -b.amount, note: b.note });
    cashMove(req, { direction: 'out', account: b.currency === 'TRY' ? b.account : 'kasa', currency: b.currency, amount: b.amount, rate, category: 'tedarikci', ref_type: 'supplier', ref_id: id, description: `${s.name} ödeme${b.note ? ` — ${b.note}` : ''}` });
  });
  audit(req, 'supplier.payment', 'supplier', id, b);
  res.status(201).json({ ok: true, balances: balances('supplier_ledger', 'supplier_id', id) });
});

export default r;
