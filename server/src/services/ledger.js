import { q, nowIso } from '../db/index.js';
import { round2, round3 } from '../lib/gold.js';

export function cashMove(req, { direction, account = 'kasa', currency = 'TRY', amount, rate = 1, category, ref_type = null, ref_id = null, description = null, ts = nowIso() }) {
  if (!(amount > 0)) return null;
  const amt = currency === 'HAS' ? round3(amount) : round2(amount);
  return q.run(
    `INSERT INTO cash_movements(ts, direction, account, currency, amount, rate, amount_try, category, ref_type, ref_id, description, user_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ts, direction, account, currency, amt, rate, round2(amt * rate), category, ref_type, ref_id, description, req.user?.id ?? null,
  ).lastInsertRowid;
}

export function customerEntry(req, { customer_id, type, currency, amount, ref_type = null, ref_id = null, note = null }) {
  if (!amount) return null;
  return q.run('INSERT INTO customer_ledger(ts, customer_id, type, currency, amount, ref_type, ref_id, note, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
    nowIso(), customer_id, type, currency, currency === 'HAS' ? round3(amount) : round2(amount), ref_type, ref_id, note, req.user?.id ?? null).lastInsertRowid;
}

export function supplierEntry(req, { supplier_id, type, currency, amount, note = null }) {
  if (!amount) return null;
  return q.run('INSERT INTO supplier_ledger(ts, supplier_id, type, currency, amount, note, user_id) VALUES (?,?,?,?,?,?,?)',
    nowIso(), supplier_id, type, currency, currency === 'HAS' ? round3(amount) : round2(amount), note, req.user?.id ?? null).lastInsertRowid;
}

export function balances(table, idCol, id) {
  const rows = q.all(`SELECT currency, SUM(amount) AS total FROM ${table} WHERE ${idCol} = ? GROUP BY currency`, id);
  return Object.fromEntries(rows.map((r) => [r.currency, r.currency === 'HAS' ? round3(r.total) : round2(r.total)]));
}

export function cashBalances() {
  const rows = q.all(`SELECT account, currency, SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS total
    FROM cash_movements WHERE cancelled = 0 GROUP BY account, currency`);
  const out = {};
  for (const r of rows) {
    out[r.account] ??= {};
    out[r.account][r.currency] = r.currency === 'HAS' ? round3(r.total) : round2(r.total);
  }
  return out;
}

export function stockMove(req, { product_id, type, qty, note = null, ref_type = null, ref_id = null }) {
  q.run('INSERT INTO stock_movements(ts, product_id, type, qty, note, ref_type, ref_id, user_id) VALUES (?,?,?,?,?,?,?,?)',
    nowIso(), product_id, type, qty, note, ref_type, ref_id, req.user?.id ?? null);
  q.run("UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?", qty, product_id);
}
