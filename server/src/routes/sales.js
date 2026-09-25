import { Router } from 'express';
import { z } from 'zod';
import { q, tx, nextNo, nowIso, getSetting, dayStart, dayEnd, isoAgo } from '../db/index.js';
import { parse, zs, bad, notFound, HttpError } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { priceMap } from '../services/prices.js';
import { cashMove, customerEntry, stockMove } from '../services/ledger.js';
import { productPricing, scrapValue, milyemOf, round2, round3 } from '../lib/gold.js';
import { audit } from '../security/audit.js';

const r = Router();

const itemSchema = z.object({
  product_id: zs.id.optional().nullable(),
  description: zs.optStr(160),
  qty: z.coerce.number().int().min(1).max(1000).default(1),
  karat: zs.optStr(4),
  gram: zs.gram.optional(),
  unit_price: zs.money.optional().nullable(), // fiyat değiştirme (yetki ve indirim sınırına tabi)
});

const paymentSchema = z.object({
  method: z.enum(['nakit', 'kart', 'havale', 'doviz', 'altin', 'veresiye']),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP', 'HAS']).default('TRY'),
  amount: z.coerce.number().min(0).max(1e10).optional(),
  karat: zs.optStr(4),       // eski altın takası
  gram: zs.gram.optional(),
  fire_pct: z.coerce.number().min(0).max(50).optional(),
});

const saleSchema = z.object({
  customer_id: zs.id.optional().nullable(),
  staff_id: zs.id.optional().nullable(),
  items: z.array(itemSchema).min(1).max(100),
  discount: zs.money.default(0),
  payments: z.array(paymentSchema).max(10).default([]),
  note: zs.optStr(500),
});

/** Sepeti sunucu tarafında fiyatlar. İstemcinin gönderdiği fiyata asla körü körüne güvenilmez. */
function priceCart(req, body, prices) {
  const business = getSetting('business', {});
  const elevated = ['owner', 'manager'].includes(req.user.role);
  const lines = body.items.map((it) => {
    if (it.product_id) {
      const p = q.get('SELECT * FROM products WHERE id = ? AND active = 1', it.product_id);
      if (!p) throw bad(`Ürün bulunamadı (#${it.product_id})`);
      const pr = productPricing(p, prices, business.price_rounding);
      if (pr.unit === null) throw bad(`${p.name} için güncel fiyat yok`);
      const listUnit = pr.unit;
      const unit = it.unit_price ?? listUnit;
      const cost = round2(p.cost_has * (prices.HAS?.sell || 0) + p.cost_tl);
      return {
        product: p, product_id: p.id, description: p.name, qty: it.qty, karat: p.karat, milyem: p.milyem, gram: p.gram,
        list_unit: listUnit, unit_price: round2(unit), total: round2(unit * it.qty), has_equivalent: round3(pr.has * it.qty),
        labor_amount: round2(pr.labor * it.qty), cost_estimate: round2(cost * it.qty),
      };
    }
    // Serbest kalem (ör. gram ile tartılan ürün, sipariş)
    if (!it.description) throw bad('Serbest kalem için açıklama gerekli');
    if (it.unit_price === undefined || it.unit_price === null) throw bad('Serbest kalem için fiyat gerekli');
    const milyem = milyemOf(it.karat) ?? 0;
    return {
      product_id: null, description: it.description, qty: it.qty, karat: it.karat, milyem, gram: it.gram || 0,
      list_unit: it.unit_price, unit_price: round2(it.unit_price), total: round2(it.unit_price * it.qty),
      has_equivalent: round3((it.gram || 0) * milyem * it.qty), labor_amount: 0,
      cost_estimate: round2((it.gram || 0) * milyem * (prices.HAS?.sell || 0) * it.qty),
    };
  });
  const listTotal = round2(lines.reduce((s, l) => s + l.list_unit * l.qty, 0));
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const total = round2(subtotal - body.discount);
  if (total < 0) throw bad('İndirim toplamdan büyük olamaz');
  const discountPct = listTotal > 0 ? ((listTotal - total) / listTotal) * 100 : 0;
  if (!elevated && discountPct > (business.max_discount_pct_sales ?? 3) + 0.001) {
    throw new HttpError(403, `İndirim sınırı aşıldı (%${discountPct.toFixed(1)}). Yetkiniz en fazla %${business.max_discount_pct_sales}. Müdür onayı gerekir.`);
  }
  return { lines, subtotal, total, listTotal, discountPct: round2(discountPct) };
}

/** Ödeme kalemlerini TL karşılığına çevirir */
function pricePayments(payments, prices) {
  return payments.map((p) => {
    if (p.method === 'altin') {
      if (!p.gram || !p.karat) throw bad('Eski altın takası için ayar ve gram girin');
      const hasBuy = prices.HAS?.buy;
      if (!hasBuy) throw bad('Has alış fiyatı yok');
      const v = scrapValue({ gram: p.gram, karat: p.karat, fire_pct: p.fire_pct || 0 }, hasBuy);
      return { ...p, currency: 'HAS', amount: v.has, rate: hasBuy, amount_try: v.value };
    }
    if (!(p.amount > 0)) throw bad('Ödeme tutarı girin');
    if (p.method === 'doviz') {
      if (!['USD', 'EUR', 'GBP'].includes(p.currency)) throw bad('Döviz cinsi seçin');
      const rate = prices[p.currency]?.buy;
      if (!rate) throw bad(`${p.currency} kuru yok`);
      return { ...p, rate, amount_try: round2(p.amount * rate) };
    }
    if (p.method === 'veresiye' && p.currency === 'HAS') {
      const rate = prices.HAS?.sell;
      return { ...p, rate, amount_try: round2(p.amount * rate) };
    }
    return { ...p, currency: 'TRY', rate: 1, amount_try: round2(p.amount) };
  });
}

r.post('/quote', allow('sales', 'w'), (req, res) => {
  const body = parse(saleSchema, req.body);
  const prices = priceMap();
  const cart = priceCart(req, body, prices);
  const pays = pricePayments(body.payments.filter((p) => p.method === 'altin' ? p.gram : p.amount), prices);
  const paid = round2(pays.reduce((s, p) => s + p.amount_try, 0));
  const threshold = getSetting('business', {}).identity_threshold_try;
  res.json({
    lines: cart.lines.map(({ product, ...l }) => l), subtotal: cart.subtotal, total: cart.total, discount_pct: cart.discountPct,
    has_total: round3(cart.lines.reduce((s, l) => s + l.has_equivalent, 0)), payments: pays, paid, remaining: round2(cart.total - paid),
    identity_required: cart.total >= threshold, identity_threshold: threshold, rates: { HAS: prices.HAS, USD: prices.USD, EUR: prices.EUR, GBP: prices.GBP },
  });
});

r.post('/', allow('sales', 'w'), (req, res) => {
  const body = parse(saleSchema, req.body);
  const prices = priceMap();
  const business = getSetting('business', {});
  const result = tx(() => {
    const cart = priceCart(req, body, prices);
    const pays = pricePayments(body.payments, prices);
    const paid = round2(pays.reduce((s, p) => s + p.amount_try, 0));
    if (Math.abs(paid - cart.total) > 1) {
      throw bad(`Ödemeler toplamı (${paid.toLocaleString('tr-TR')} ₺) satış tutarı (${cart.total.toLocaleString('tr-TR')} ₺) ile eşleşmiyor`);
    }
    let customer = null;
    if (body.customer_id) {
      customer = q.get('SELECT * FROM customers WHERE id = ? AND anonymized = 0', body.customer_id);
      if (!customer) throw bad('Müşteri bulunamadı');
    }
    if (pays.some((p) => p.method === 'veresiye') && !customer) throw bad('Veresiye satış için müşteri seçilmelidir');
    // MASAK: eşik üzeri işlemlerde kimlik tespiti zorunlu
    if (cart.total >= business.identity_threshold_try && !customer?.tckn_enc) {
      throw new HttpError(400, `${business.identity_threshold_try.toLocaleString('tr-TR')} ₺ ve üzeri işlemlerde kimlik tespiti zorunludur. TC kimlik no kayıtlı müşteri seçin.`, { code: 'IDENTITY_REQUIRED' });
    }
    // Stok kontrolü
    const need = new Map();
    for (const l of cart.lines) if (l.product_id) need.set(l.product_id, (need.get(l.product_id) || 0) + l.qty);
    for (const [pid, qty] of need) {
      const p = q.get('SELECT name, stock_qty FROM products WHERE id = ?', pid);
      if (p.stock_qty < qty) throw bad(`Yetersiz stok: ${p.name} (stok: ${p.stock_qty})`);
    }
    const ts = nowIso();
    const no = nextNo('S');
    const credit = round2(pays.filter((p) => p.method === 'veresiye').reduce((s, p) => s + p.amount_try, 0));
    const staffId = body.staff_id ?? req.user.staff_id ?? null;
    const saleId = q.run(
      `INSERT INTO sales(no, ts, customer_id, user_id, staff_id, subtotal, discount, total, has_total, cost_total, paid_total, credit_total, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      no, ts, customer?.id ?? null, req.user.id, staffId, cart.subtotal, body.discount, cart.total,
      round3(cart.lines.reduce((s, l) => s + l.has_equivalent, 0)), round2(cart.lines.reduce((s, l) => s + l.cost_estimate, 0)),
      round2(paid - credit), credit, body.note,
    ).lastInsertRowid;
    for (const l of cart.lines) {
      q.run(`INSERT INTO sale_items(sale_id, product_id, description, qty, karat, milyem, gram, unit_price, total, has_equivalent, labor_amount, cost_estimate)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, saleId, l.product_id, l.description, l.qty, l.karat, l.milyem, l.gram, l.unit_price, l.total,
      l.has_equivalent, l.labor_amount, l.cost_estimate);
      if (l.product_id) stockMove(req, { product_id: l.product_id, type: 'satis', qty: -l.qty, ref_type: 'sale', ref_id: saleId, note: no });
    }
    // Ödemelerin kasaya/cariye işlenmesi; tutar fazlası (para üstü) nakitten düşülür
    let change = round2(paid - cart.total);
    for (const p of pays) {
      const desc = `${no} satış`;
      if (p.method === 'veresiye') {
        customerEntry(req, { customer_id: customer.id, type: 'veresiye', currency: p.currency, amount: p.amount, ref_type: 'sale', ref_id: saleId, note: desc });
      } else if (p.method === 'altin') {
        cashMove(req, { direction: 'in', account: 'kasa', currency: 'HAS', amount: p.amount, rate: p.rate, category: 'takas', ref_type: 'sale', ref_id: saleId, description: `${desc} — ${p.gram} gr ${p.karat} ayar takas` });
      } else {
        const account = p.method === 'kart' ? 'pos' : p.method === 'havale' ? 'banka' : 'kasa';
        cashMove(req, { direction: 'in', account, currency: p.currency, amount: p.amount, rate: p.rate, category: 'satis', ref_type: 'sale', ref_id: saleId, description: `${desc} (${p.method})` });
      }
    }
    if (change > 0) {
      cashMove(req, { direction: 'out', account: 'kasa', currency: 'TRY', amount: change, category: 'satis', ref_type: 'sale', ref_id: saleId, description: `${no} para üstü` });
    }
    return { id: saleId, no, total: cart.total, discountPct: cart.discountPct };
  });
  audit(req, 'sale.create', 'sale', result.id, { no: result.no, total: result.total, discount_pct: result.discountPct });
  res.status(201).json(result);
});

r.get('/', guard('sales'), (req, res) => {
  const f = parse(z.object({
    from: zs.date.optional(), to: zs.date.optional(), q: z.string().max(60).optional(),
    customer_id: z.coerce.number().int().optional(), status: z.enum(['tamam', 'iptal']).optional(),
  }), req.query);
  let sql = `SELECT s.*, c.full_name AS customer_name, u.full_name AS user_name, st.full_name AS staff_name,
    (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS item_count
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id LEFT JOIN staff st ON st.id = s.staff_id WHERE 1=1`;
  const p = [];
  if (f.from) { sql += ' AND s.ts >= ?'; p.push(dayStart(f.from)); }
  if (f.to) { sql += ' AND s.ts <= ?'; p.push(dayEnd(f.to)); }
  if (f.q) { sql += ' AND (s.no LIKE ? OR c.full_name LIKE ?)'; p.push(`%${f.q}%`, `%${f.q}%`); }
  if (f.customer_id) { sql += ' AND s.customer_id = ?'; p.push(f.customer_id); }
  if (f.status) { sql += ' AND s.status = ?'; p.push(f.status); }
  // Satış personeli yalnızca son 7 günü görür
  if (req.user.role === 'sales') { sql += ' AND s.ts >= ?'; p.push(isoAgo(7)); }
  sql += ' ORDER BY s.id DESC LIMIT 500';
  res.json(q.all(sql, ...p));
});

r.get('/:id', guard('sales'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const s = q.get(`SELECT s.*, c.full_name AS customer_name, c.phone AS customer_phone, c.tckn_masked, u.full_name AS user_name, st.full_name AS staff_name
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id LEFT JOIN staff st ON st.id = s.staff_id WHERE s.id = ?`, id);
  if (!s) throw notFound();
  const items = q.all('SELECT * FROM sale_items WHERE sale_id = ?', id);
  const payments = q.all("SELECT * FROM cash_movements WHERE ref_type = 'sale' AND ref_id = ? ORDER BY id", id);
  const credit = q.all("SELECT * FROM customer_ledger WHERE ref_type = 'sale' AND ref_id = ? ORDER BY id", id);
  res.json({ ...s, items, payments, credit });
});

r.post('/:id/cancel', allow('sales', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
  const business = getSetting('business', {});
  if (!(business.cancel_roles || ['owner', 'manager']).includes(req.user.role)) throw new HttpError(403, 'Satış iptali için yetkiniz yok');
  const sale = q.get('SELECT * FROM sales WHERE id = ?', id);
  if (!sale) throw notFound();
  if (sale.status === 'iptal') throw bad('Satış zaten iptal edilmiş');
  tx(() => {
    q.run('UPDATE sales SET status = ?, cancel_reason = ?, cancelled_by = ?, cancelled_at = ? WHERE id = ?', 'iptal', reason, req.user.id, nowIso(), id);
    for (const it of q.all('SELECT * FROM sale_items WHERE sale_id = ? AND product_id IS NOT NULL', id)) {
      stockMove(req, { product_id: it.product_id, type: 'iptal', qty: it.qty, ref_type: 'sale', ref_id: id, note: `${sale.no} iptal` });
    }
    q.run("UPDATE cash_movements SET cancelled = 1 WHERE ref_type = 'sale' AND ref_id = ?", id);
    for (const l of q.all("SELECT * FROM customer_ledger WHERE ref_type = 'sale' AND ref_id = ?", id)) {
      customerEntry(req, { customer_id: l.customer_id, type: 'iptal', currency: l.currency, amount: -l.amount, ref_type: 'sale', ref_id: id, note: `${sale.no} iptal` });
    }
  });
  audit(req, 'sale.cancel', 'sale', id, { no: sale.no, total: sale.total, reason });
  res.json({ ok: true });
});

export default r;
