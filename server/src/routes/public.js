import { Router } from 'express';
import { z } from 'zod';
import { q, getSetting, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { parse, zs, notFound } from '../middleware/validate.js';
import { publicPrices, priceEvents, priceMap } from '../services/prices.js';
import { productPricing } from '../lib/gold.js';
import { rateLimit } from '../security/rateLimit.js';
import { sha256 } from '../security/crypto.js';

const r = Router();

const PUBLIC_SITE_KEYS = ['name', 'slogan', 'founded_year', 'phone', 'whatsapp', 'email', 'instagram', 'facebook', 'address', 'map_query',
  'hours', 'about_title', 'about_text', 'values', 'hero_title', 'hero_text', 'show_prices', 'price_note', 'theme'];

r.get('/site', (_req, res) => {
  const site = getSetting('site', {});
  const images = q.all('SELECT id, kind, path, caption FROM site_images ORDER BY kind, sort, id');
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ ...Object.fromEntries(PUBLIC_SITE_KEYS.map((k) => [k, site[k]])), images });
});

r.get('/prices', (_req, res) => {
  const site = getSetting('site', {});
  const data = publicPrices();
  const show = site.show_prices;
  if (Array.isArray(show) && show.length) data.items = data.items.filter((i) => show.includes(i.code));
  res.set('Cache-Control', 'no-cache');
  res.json(data);
});

/** Anlık fiyat akışı (Server-Sent Events) */
let sseClients = 0;
r.get('/prices/stream', (req, res) => {
  if (sseClients > 500) return res.status(503).end();
  sseClients++;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const show = getSetting('site', {}).show_prices;
  const send = (data) => {
    const items = Array.isArray(show) && show.length ? data.items.filter((i) => show.includes(i.code)) : data.items;
    res.write(`data: ${JSON.stringify({ ...data, items })}\n\n`);
  };
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  priceEvents.on('update', send);
  req.on('close', () => {
    sseClients--;
    clearInterval(ping);
    priceEvents.off('update', send);
  });
});

r.get('/categories', (_req, res) => {
  res.json(q.all(`SELECT c.id, c.name, c.slug, c.icon,
    (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1 AND p.show_on_site = 1) AS count
    FROM categories c WHERE c.show_on_site = 1 ORDER BY c.sort`));
});

function publicProduct(p, prices, rounding) {
  const pr = productPricing(p, prices, rounding);
  return {
    id: p.id, name: p.name, category: p.category_name, category_slug: p.category_slug, karat: p.karat, gram: p.gram,
    stone_desc: p.stone_desc, description: p.description, image: p.image, featured: !!p.featured,
    in_stock: p.stock_qty > 0, price: p.show_price_on_site ? pr.unit : null,
  };
}

const LIST_SQL = `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
  LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND p.show_on_site = 1`;

r.get('/products', (req, res) => {
  const f = parse(z.object({
    category: z.string().max(40).optional(),
    featured: z.string().optional(),
    q: z.string().max(60).optional(),
    karat: z.string().max(4).optional(),
    sort: z.enum(['new', 'price_asc', 'price_desc', 'gram']).optional(),
  }), req.query);
  let sql = LIST_SQL;
  const params = [];
  if (f.category) { sql += ' AND c.slug = ?'; params.push(f.category); }
  if (f.featured) sql += ' AND p.featured = 1';
  if (f.karat) { sql += ' AND p.karat = ?'; params.push(f.karat); }
  if (f.q) { sql += ' AND p.name LIKE ?'; params.push(`%${f.q}%`); }
  sql += ' ORDER BY p.featured DESC, p.id DESC LIMIT 200';
  const prices = priceMap();
  const rounding = getSetting('business', {}).price_rounding;
  let items = q.all(sql, ...params).map((p) => publicProduct(p, prices, rounding));
  if (f.sort === 'price_asc') items.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  if (f.sort === 'price_desc') items.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  if (f.sort === 'gram') items.sort((a, b) => b.gram - a.gram);
  res.json(items);
});

r.get('/products/:id', (req, res) => {
  const id = parse(zs.id, req.params.id);
  const p = q.get(`${LIST_SQL} AND p.id = ?`, id);
  if (!p) throw notFound('Ürün bulunamadı');
  const prices = priceMap();
  const rounding = getSetting('business', {}).price_rounding;
  const related = q.all(`${LIST_SQL} AND p.category_id = ? AND p.id <> ? ORDER BY p.featured DESC LIMIT 4`, p.category_id, p.id)
    .map((x) => publicProduct(x, prices, rounding));
  res.json({ ...publicProduct(p, prices, rounding), related });
});

// Web sitesinden gelen "Bu ürünü sor / Beni arayın" talepleri
const inquiryLimiter = rateLimit({ windowMs: 60 * 60_000, max: config.isTest ? 1000 : 5, message: 'Çok fazla talep gönderdiniz. Lütfen daha sonra tekrar deneyin veya bizi arayın.' });
r.post('/inquiries', inquiryLimiter, (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(2).max(80),
    phone: zs.phone.refine((v) => v.replace(/\D/g, '').length >= 10, 'Telefon numarası eksik'),
    message: z.string().trim().max(1000).optional(),
    product_id: zs.id.optional().nullable(),
    website: z.string().max(0).optional(), // bal küpü (bot tuzağı) — dolu gelirse reddedilir
    consent: z.literal(true, { error: 'KVKK aydınlatma metnini onaylamalısınız' }),
  }), req.body);
  const productId = body.product_id && q.get('SELECT id FROM products WHERE id = ?', body.product_id) ? body.product_id : null;
  q.run('INSERT INTO inquiries(ts, name, phone, message, product_id, ip_hash) VALUES (?,?,?,?,?,?)',
    nowIso(), body.name, body.phone, body.message || null, productId, sha256(req.ip || ''));
  res.status(201).json({ ok: true });
});

export default r;
