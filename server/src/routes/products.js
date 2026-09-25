import { Router } from 'express';
import { z } from 'zod';
import { q, tx, getSetting } from '../db/index.js';
import { parse, zs, bad, notFound } from '../middleware/validate.js';
import { guard, allow } from '../middleware/auth.js';
import { priceMap } from '../services/prices.js';
import { stockMove } from '../services/ledger.js';
import { productPricing, milyemOf, round3, round2 } from '../lib/gold.js';
import { audit } from '../security/audit.js';

const r = Router();

// ---- Kategoriler ----
r.get('/categories', guard('products'), (_req, res) => {
  res.json(q.all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS count FROM categories c ORDER BY sort'));
});

const catSchema = z.object({
  name: zs.str(60).min(1),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/, 'yalnızca küçük harf, rakam ve tire'),
  icon: zs.optStr(30),
  sort: z.coerce.number().int().default(0),
  show_on_site: zs.bool.default(true),
});
r.post('/categories', allow('products', 'w'), (req, res) => {
  const b = parse(catSchema, req.body);
  const id = q.run('INSERT INTO categories(name, slug, icon, sort, show_on_site) VALUES (?,?,?,?,?)', b.name, b.slug, b.icon, b.sort, b.show_on_site ? 1 : 0).lastInsertRowid;
  audit(req, 'category.create', 'category', id, b);
  res.status(201).json({ id });
});
r.put('/categories/:id', allow('products', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(catSchema, req.body);
  q.run('UPDATE categories SET name = ?, slug = ?, icon = ?, sort = ?, show_on_site = ? WHERE id = ?', b.name, b.slug, b.icon, b.sort, b.show_on_site ? 1 : 0, id);
  audit(req, 'category.update', 'category', id, b);
  res.json({ ok: true });
});
r.delete('/categories/:id', allow('products', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  if (q.get('SELECT 1 FROM products WHERE category_id = ? LIMIT 1', id)) throw bad('Bu kategoride ürün var; önce ürünleri taşıyın');
  q.run('DELETE FROM categories WHERE id = ?', id);
  audit(req, 'category.delete', 'category', id);
  res.json({ ok: true });
});

// ---- Ürünler ----
function withPricing(p, prices, rounding) {
  const pr = productPricing(p, prices, rounding);
  return { ...p, price: pr.unit, has_equivalent: pr.has, labor_amount: pr.labor, price_basis: pr.basis };
}

r.get('/', guard('products'), (req, res) => {
  const f = parse(z.object({
    q: z.string().max(80).optional(),
    category_id: z.coerce.number().int().optional(),
    kind: z.string().max(20).optional(),
    low: z.string().optional(),
    inactive: z.string().optional(),
  }), req.query);
  let sql = `SELECT p.*, c.name AS category_name, s.name AS supplier_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE 1=1`;
  const params = [];
  if (!f.inactive) sql += ' AND p.active = 1';
  if (f.q) { sql += ' AND (p.name LIKE ? OR p.sku = ? OR p.barcode = ?)'; params.push(`%${f.q}%`, f.q, f.q); }
  if (f.category_id) { sql += ' AND p.category_id = ?'; params.push(f.category_id); }
  if (f.kind) { sql += ' AND p.kind = ?'; params.push(f.kind); }
  if (f.low) sql += ' AND p.stock_qty <= p.min_stock';
  sql += ' ORDER BY p.id DESC LIMIT 1000';
  const prices = priceMap();
  const rounding = getSetting('business', {}).price_rounding;
  res.json(q.all(sql, ...params).map((p) => withPricing(p, prices, rounding)));
});

/** Barkod okuyucu ile hızlı arama (tam eşleşme) */
r.get('/lookup/:code', guard('products'), (req, res) => {
  const code = String(req.params.code).slice(0, 60);
  const p = q.get('SELECT * FROM products WHERE (barcode = ? OR sku = ?) AND active = 1', code, code);
  if (!p) throw notFound('Barkod bulunamadı');
  res.json(withPricing(p, priceMap(), getSetting('business', {}).price_rounding));
});

r.get('/:id', guard('products'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const p = q.get('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', id);
  if (!p) throw notFound();
  const movements = q.all(`SELECT m.*, u.full_name AS user_name FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
    WHERE product_id = ? ORDER BY m.id DESC LIMIT 100`, id);
  res.json({ ...withPricing(p, priceMap(), getSetting('business', {}).price_rounding), movements });
});

const productSchema = z.object({
  sku: z.string().trim().min(1).max(40).optional(),
  barcode: zs.optStr(40),
  name: zs.str(120).min(2),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  kind: z.enum(['taki', 'sarrafiye', 'pirlanta', 'gumus', 'saat', 'diger']).default('taki'),
  karat: zs.optStr(4),
  milyem: z.coerce.number().min(0).max(1).nullable().optional(),
  gram: zs.gram.default(0),
  labor_milyem: z.coerce.number().min(0).max(5).default(0),
  labor_tl: zs.money.default(0),
  stone_desc: zs.optStr(200),
  stone_price: zs.money.default(0),
  price_code: zs.optStr(20),
  price_mode: z.enum(['auto', 'fixed']).default('auto'),
  fixed_price: zs.money.nullable().optional(),
  cost_has: z.coerce.number().min(0).max(100000).default(0),
  cost_tl: zs.money.default(0),
  supplier_id: z.coerce.number().int().positive().nullable().optional(),
  min_stock: z.coerce.number().int().min(0).max(100000).default(0),
  location: zs.optStr(40),
  description: zs.optStr(2000),
  image: z.string().max(200).regex(/^\/(uploads|img)\/[A-Za-z0-9._/-]+$/, 'geçersiz görsel yolu').nullable().optional(),
  show_on_site: zs.bool.default(true),
  show_price_on_site: zs.bool.default(true),
  featured: zs.bool.default(false),
  active: zs.bool.default(true),
});

function normalizeProduct(b) {
  const milyem = b.milyem ?? milyemOf(b.karat);
  if (b.price_code && !q.get('SELECT 1 FROM price_items WHERE code = ?', b.price_code)) throw bad('Geçersiz fiyat kodu');
  if (b.price_mode === 'fixed' && !b.fixed_price) throw bad('Sabit fiyatlı ürün için fiyat girin');
  return { ...b, milyem, cost_has: b.cost_has || round3((b.gram || 0) * (milyem || 0)) };
}

const COLS = ['sku', 'barcode', 'name', 'category_id', 'kind', 'karat', 'milyem', 'gram', 'labor_milyem', 'labor_tl', 'stone_desc', 'stone_price',
  'price_code', 'price_mode', 'fixed_price', 'cost_has', 'cost_tl', 'supplier_id', 'min_stock', 'location', 'description', 'image',
  'show_on_site', 'show_price_on_site', 'featured', 'active'];
const val = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null);

r.post('/', allow('products', 'w'), (req, res) => {
  const b = normalizeProduct(parse(productSchema.extend({ stock_qty: z.coerce.number().int().min(0).max(100000).default(1) }), req.body));
  const id = tx(() => {
    const sku = b.sku || `DC-${String((q.get('SELECT MAX(id) AS m FROM products').m || 0) + 1).padStart(4, '0')}`;
    if (q.get('SELECT 1 FROM products WHERE sku = ?', sku)) throw bad('Bu stok kodu zaten kullanılıyor');
    if (b.barcode && q.get('SELECT 1 FROM products WHERE barcode = ?', b.barcode)) throw bad('Bu barkod zaten kullanılıyor');
    const data = { ...b, sku };
    const newId = q.run(`INSERT INTO products(${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})`, ...COLS.map((c) => val(data[c]))).lastInsertRowid;
    if (b.stock_qty) stockMove(req, { product_id: newId, type: 'giris', qty: b.stock_qty, note: 'İlk stok girişi' });
    return newId;
  });
  audit(req, 'product.create', 'product', id, { name: b.name, stock: b.stock_qty });
  res.status(201).json({ id });
});

r.put('/:id', allow('products', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const before = q.get('SELECT * FROM products WHERE id = ?', id);
  if (!before) throw notFound();
  const b = normalizeProduct(parse(productSchema, req.body));
  const data = { ...b, sku: b.sku || before.sku };
  if (q.get('SELECT 1 FROM products WHERE sku = ? AND id <> ?', data.sku, id)) throw bad('Bu stok kodu zaten kullanılıyor');
  if (data.barcode && q.get('SELECT 1 FROM products WHERE barcode = ? AND id <> ?', data.barcode, id)) throw bad('Bu barkod zaten kullanılıyor');
  q.run(`UPDATE products SET ${COLS.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...COLS.map((c) => val(data[c])), id);
  const changed = Object.fromEntries(COLS.filter((c) => String(val(data[c])) !== String(before[c])).map((c) => [c, [before[c], val(data[c])]]));
  audit(req, 'product.update', 'product', id, changed);
  res.json({ ok: true });
});

r.delete('/:id', allow('products', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  // Geçmiş hareketler korunur; ürün pasife alınır
  q.run("UPDATE products SET active = 0, show_on_site = 0, updated_at = datetime('now') WHERE id = ?", id);
  audit(req, 'product.deactivate', 'product', id);
  res.json({ ok: true });
});

/** Stok hareketi: giriş, çıkış, sayım düzeltmesi */
r.post('/:id/stock', allow('products', 'w'), (req, res) => {
  const id = parse(zs.id, req.params.id);
  const b = parse(z.object({
    type: z.enum(['giris', 'cikis', 'sayim']),
    qty: z.coerce.number().int().min(0).max(100000),
    note: zs.optStr(200),
  }), req.body);
  const p = q.get('SELECT * FROM products WHERE id = ?', id);
  if (!p) throw notFound();
  let delta = b.qty;
  if (b.type === 'cikis') delta = -b.qty;
  if (b.type === 'sayim') delta = b.qty - p.stock_qty;
  if (p.stock_qty + delta < 0) throw bad('Stok eksiye düşemez');
  if (delta === 0) return res.json({ ok: true, stock_qty: p.stock_qty });
  tx(() => stockMove(req, { product_id: id, type: b.type, qty: delta, note: b.note }));
  audit(req, 'stock.move', 'product', id, { type: b.type, delta, from: p.stock_qty });
  res.json({ ok: true, stock_qty: p.stock_qty + delta });
});

/** Stok değeri özeti (has gram ve TL) */
r.get('/summary/valuation', guard('products'), (_req, res) => {
  const prices = priceMap();
  const rows = q.all(`SELECT p.kind, p.karat, SUM(p.stock_qty) AS qty, SUM(p.stock_qty * p.gram) AS gram, SUM(p.stock_qty * p.gram * COALESCE(p.milyem,0)) AS has
    FROM products p WHERE p.active = 1 AND p.stock_qty > 0 GROUP BY p.kind, p.karat ORDER BY has DESC`);
  const totalHas = rows.filter((r0) => r0.kind !== 'gumus').reduce((s, r0) => s + (r0.has || 0), 0);
  res.json({ rows: rows.map((r0) => ({ ...r0, gram: round3(r0.gram), has: round3(r0.has) })), total_has: round3(totalHas), total_try: round2(totalHas * (prices.HAS?.buy || 0)) });
});

export default r;
