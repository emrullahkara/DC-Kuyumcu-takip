import { Router } from 'express';
import { z } from 'zod';
import { q, tx, nextNo, nowIso, getSetting, dayStart, dayEnd } from '../db/index.js';
import { parse, zs, bad, notFound, HttpError } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { priceMap } from '../services/prices.js';
import { cashMove, customerEntry, supplierEntry, stockMove } from '../services/ledger.js';
import { scrapValue, round2, round3 } from '../lib/gold.js';
import { audit } from '../security/audit.js';

/**
 * Alış işlemleri:
 *  - hurda: müşteriden eski/kırık altın alımı (bozdurma) — gram × (1−fire) × milyem × has alış
 *  - sarrafiye: çeyrek/yarım/tam vb. geri alım — adet × fiyat kalemi alış
 *  - urun: toptancıdan mal alımı — has ve/veya TL maliyetle, stok girişiyle
 */
const r = Router();

const itemSchema = z.object({
  description: zs.optStr(160),
  karat: zs.optStr(4),
  gram: zs.gram.optional(),
  fire_pct: z.coerce.number().min(0).max(50).optional(),
  qty: z.coerce.number().int().min(1).max(10000).default(1),
  price_code: zs.optStr(20),
  product_id: zs.id.optional().nullable(),
  unit_has: z.coerce.number().min(0).max(10000).optional(),
  unit_tl: zs.money.optional(),
  unit_price: zs.money.optional().nullable(),
});

const paySchema = z.object({
  method: z.enum(['nakit', 'havale', 'doviz', 'cari']),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP', 'HAS']).default('TRY'),
  amount: z.coerce.number().positive().max(1e10),
});

const purchaseSchema = z.object({
  kind: z.enum(['hurda', 'sarrafiye', 'urun']),
  customer_id: zs.id.optional().nullable(),
  supplier_id: zs.id.optional().nullable(),
  items: z.array(itemSchema).min(1).max(100),
  payments: z.array(paySchema).max(10).default([]),
  // yalnızca 'urun' için: has ve TL borcunun nasıl kapanacağı
  settle_has: z.enum(['cari', 'kasa']).default('cari'),
  settle_tl: z.enum(['cari', 'nakit', 'banka']).default('cari'),
  note: zs.optStr(500),
});

function priceItems(body, prices) {
  const business = getSetting('business', {});
  return body.items.map((it) => {
    if (body.kind === 'hurda') {
      if (!it.gram || !it.karat) throw bad('Hurda alımı için ayar ve gram girin');
      const v = scrapValue({ gram: it.gram, karat: it.karat, fire_pct: it.fire_pct ?? business.default_fire_pct ?? 0 }, prices.HAS.buy);
      const total = it.unit_price ?? v.value; // tartı sonrası pazarlık fiyatı girilebilir
      return { ...it, fire_pct: it.fire_pct ?? business.default_fire_pct ?? 0, description: it.description || `${it.karat} ayar hurda`, milyem: v.milyem, qty: 1,
        has_equivalent: v.has, unit_price: round2(total), total: round2(total) };
    }
    if (body.kind === 'sarrafiye') {
      const code = it.price_code;
      const pi = code && q.get('SELECT * FROM price_items WHERE code = ? AND category = ?', code, 'sarrafiye')
        || (code === 'GRAM' && q.get("SELECT * FROM price_items WHERE code = 'GRAM'"));
      if (!pi) throw bad('Sarrafiye türü seçin');
      const unit = it.unit_price ?? pi.buy;
      const def = { CEYREK: 1.75, YARIM: 3.5, TAM: 7, CUMHURIYET: 7.216, ATA: 7.216, RESAT: 7.216, GREMSE: 17.54, GRAM: 1 }[code] || 0;
      const milyem = code === 'GRAM' ? 0.995 : 0.916;
      return { ...it, description: it.description || pi.name, karat: code === 'GRAM' ? '24' : '22', milyem, gram: def * it.qty,
        has_equivalent: round3(def * milyem * it.qty), unit_price: round2(unit), total: round2(unit * it.qty) };
    }
    // urun
    const p = it.product_id && q.get('SELECT * FROM products WHERE id = ?', it.product_id);
    if (!p) throw bad('Ürün seçin');
    const unitHas = it.unit_has ?? p.cost_has;
    const unitTl = it.unit_tl ?? 0;
    return { ...it, product: p, description: p.name, karat: p.karat, milyem: p.milyem, gram: p.gram * it.qty, unit_has: unitHas, unit_tl: unitTl,
      has_equivalent: round3(unitHas * it.qty), unit_price: round2(unitHas * prices.HAS.buy + unitTl), total: round2((unitHas * prices.HAS.buy + unitTl) * it.qty) };
  });
}

r.post('/quote', allow('purchases', 'w'), (req, res) => {
  const body = parse(purchaseSchema, req.body);
  const prices = priceMap();
  const items = priceItems(body, prices).map(({ product, ...i }) => i);
  res.json({ items, total: round2(items.reduce((s, i) => s + i.total, 0)), has_total: round3(items.reduce((s, i) => s + i.has_equivalent, 0)), rates: { HAS: prices.HAS } });
});

r.post('/', allow('purchases', 'w'), (req, res) => {
  const body = parse(purchaseSchema, req.body);
  const prices = priceMap();
  const business = getSetting('business', {});
  const result = tx(() => {
    const items = priceItems(body, prices);
    const total = round2(items.reduce((s, i) => s + i.total, 0));
    const hasTotal = round3(items.reduce((s, i) => s + i.has_equivalent, 0));
    const customer = body.customer_id ? q.get('SELECT * FROM customers WHERE id = ?', body.customer_id) : null;
    const supplier = body.supplier_id ? q.get('SELECT * FROM suppliers WHERE id = ?', body.supplier_id) : null;
    if (body.kind === 'urun' && !supplier) throw bad('Ürün alımı için tedarikçi seçin');
    if (body.kind !== 'urun' && total >= business.identity_threshold_try && !customer?.tckn_enc) {
      throw new HttpError(400, `${business.identity_threshold_try.toLocaleString('tr-TR')} ₺ ve üzeri alımlarda kimlik tespiti zorunludur.`, { code: 'IDENTITY_REQUIRED' });
    }
    const ts = nowIso();
    const no = nextNo('A');
    const id = q.run('INSERT INTO purchases(no, ts, kind, customer_id, supplier_id, user_id, total, has_total, note) VALUES (?,?,?,?,?,?,?,?,?)',
      no, ts, body.kind, customer?.id ?? null, supplier?.id ?? null, req.user.id, total, hasTotal, body.note).lastInsertRowid;
    for (const i of items) {
      q.run(`INSERT INTO purchase_items(purchase_id, product_id, description, karat, milyem, gram, fire_pct, qty, price_code, unit_price, has_equivalent, total)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, i.product?.id ?? null, i.description, i.karat, i.milyem, i.gram || 0, i.fire_pct || 0, i.qty, i.price_code || null,
      i.unit_price, i.has_equivalent, i.total);
    }

    if (body.kind === 'hurda') {
      // Hurda altın has karşılığıyla kasaya (altın hesabına) girer
      cashMove(req, { direction: 'in', account: 'kasa', currency: 'HAS', amount: hasTotal, rate: prices.HAS.buy, category: 'hurda', ref_type: 'purchase', ref_id: id, description: `${no} hurda alım` });
    }
    if (body.kind === 'sarrafiye') {
      for (const i of items) {
        const prod = q.get('SELECT id FROM products WHERE price_code = ? AND active = 1 ORDER BY id LIMIT 1', i.price_code);
        if (prod) stockMove(req, { product_id: prod.id, type: 'alis', qty: i.qty, ref_type: 'purchase', ref_id: id, note: no });
        else cashMove(req, { direction: 'in', account: 'kasa', currency: 'HAS', amount: i.has_equivalent, rate: prices.HAS.buy, category: 'hurda', ref_type: 'purchase', ref_id: id, description: `${no} ${i.description}` });
      }
    }
    if (body.kind === 'urun') {
      for (const i of items) {
        stockMove(req, { product_id: i.product.id, type: 'alis', qty: i.qty, ref_type: 'purchase', ref_id: id, note: no });
        q.run("UPDATE products SET cost_has = ?, cost_tl = ?, supplier_id = ?, updated_at = datetime('now') WHERE id = ?", i.unit_has, i.unit_tl, supplier.id, i.product.id);
      }
      const tlTotal = round2(items.reduce((s, i) => s + i.unit_tl * i.qty, 0));
      if (hasTotal > 0) {
        if (body.settle_has === 'cari') supplierEntry(req, { supplier_id: supplier.id, type: 'alis', currency: 'HAS', amount: hasTotal, note: no });
        else cashMove(req, { direction: 'out', account: 'kasa', currency: 'HAS', amount: hasTotal, rate: prices.HAS.buy, category: 'tedarikci', ref_type: 'purchase', ref_id: id, description: `${no} ${supplier.name}` });
      }
      if (tlTotal > 0) {
        if (body.settle_tl === 'cari') supplierEntry(req, { supplier_id: supplier.id, type: 'alis', currency: 'TRY', amount: tlTotal, note: no });
        else cashMove(req, { direction: 'out', account: body.settle_tl === 'banka' ? 'banka' : 'kasa', currency: 'TRY', amount: tlTotal, category: 'tedarikci', ref_type: 'purchase', ref_id: id, description: `${no} ${supplier.name}` });
      }
      return { id, no, total, has_total: hasTotal };
    }

    // Müşteriye ödeme (hurda / sarrafiye)
    let paid = 0;
    for (const p of body.payments) {
      if (p.method === 'cari') {
        if (!customer) throw bad('Cariye yazmak için müşteri seçin');
        const amt = p.currency === 'HAS' ? p.amount : p.amount;
        customerEntry(req, { customer_id: customer.id, type: 'alis', currency: p.currency === 'HAS' ? 'HAS' : 'TRY', amount: -amt, ref_type: 'purchase', ref_id: id, note: `${no} — müşteriye borç` });
        paid += p.currency === 'HAS' ? p.amount * prices.HAS.buy : p.amount;
        continue;
      }
      if (p.method === 'doviz') {
        const rate = prices[p.currency]?.sell;
        if (!rate || !['USD', 'EUR', 'GBP'].includes(p.currency)) throw bad('Döviz cinsi seçin');
        cashMove(req, { direction: 'out', account: 'kasa', currency: p.currency, amount: p.amount, rate, category: 'alis', ref_type: 'purchase', ref_id: id, description: `${no} ödeme` });
        paid += p.amount * rate;
        continue;
      }
      cashMove(req, { direction: 'out', account: p.method === 'havale' ? 'banka' : 'kasa', currency: 'TRY', amount: p.amount, category: 'alis', ref_type: 'purchase', ref_id: id, description: `${no} ödeme` });
      paid += p.amount;
    }
    if (Math.abs(round2(paid) - total) > 1) throw bad(`Ödeme toplamı (${round2(paid).toLocaleString('tr-TR')} ₺) alış tutarıyla (${total.toLocaleString('tr-TR')} ₺) eşleşmiyor`);
    return { id, no, total, has_total: hasTotal };
  });
  audit(req, 'purchase.create', 'purchase', result.id, { kind: body.kind, ...result });
  res.status(201).json(result);
});

r.get('/', guard('purchases'), (req, res) => {
  const f = parse(z.object({ from: zs.date.optional(), to: zs.date.optional(), kind: z.string().max(12).optional() }), req.query);
  let sql = `SELECT p.*, c.full_name AS customer_name, s.name AS supplier_name, u.full_name AS user_name FROM purchases p
    LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id WHERE 1=1`;
  const params = [];
  if (f.from) { sql += ' AND p.ts >= ?'; params.push(dayStart(f.from)); }
  if (f.to) { sql += ' AND p.ts <= ?'; params.push(dayEnd(f.to)); }
  if (f.kind) { sql += ' AND p.kind = ?'; params.push(f.kind); }
  res.json(q.all(`${sql} ORDER BY p.id DESC LIMIT 500`, ...params));
});

r.get('/:id', guard('purchases'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const p = q.get(`SELECT p.*, c.full_name AS customer_name, s.name AS supplier_name, u.full_name AS user_name FROM purchases p
    LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`, id);
  if (!p) throw notFound();
  res.json({ ...p, items: q.all('SELECT * FROM purchase_items WHERE purchase_id = ?', id), payments: q.all("SELECT * FROM cash_movements WHERE ref_type = 'purchase' AND ref_id = ?", id) });
});

export default r;
