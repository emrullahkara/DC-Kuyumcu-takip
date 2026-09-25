import { Router } from 'express';
import { z } from 'zod';
import { q, tx, isoAgo } from '../db/index.js';
import { parse, notFound } from '../middleware/validate.js';
import { guard } from '../middleware/auth.js';
import { recomputeAll, fetchPrices, status } from '../services/prices.js';
import { audit } from '../security/audit.js';
import { KARATS } from '../lib/gold.js';

const r = Router();
r.use(guard('prices'));

r.get('/', (_req, res) => {
  res.json({ items: q.all('SELECT * FROM price_items ORDER BY sort'), status, karats: KARATS });
});

r.get('/history/:code', (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
  res.json(q.all('SELECT buy, sell, ts FROM price_history WHERE code = ? AND ts >= ? ORDER BY ts', req.params.code, isoAgo(days)));
});

const itemSchema = z.object({
  margin_type: z.enum(['pct', 'fixed']).optional(),
  margin_buy: z.coerce.number().min(-50).max(100000).optional(),
  margin_sell: z.coerce.number().min(-50).max(100000).optional(),
  manual_active: z.boolean().optional(),
  manual_buy: z.coerce.number().positive().max(1e9).nullable().optional(),
  manual_sell: z.coerce.number().positive().max(1e9).nullable().optional(),
  show_on_site: z.boolean().optional(),
});

r.put('/:code', (req, res) => {
  const body = parse(itemSchema, req.body);
  const item = q.get('SELECT * FROM price_items WHERE code = ?', req.params.code);
  if (!item) throw notFound();
  if (body.manual_active && !((body.manual_buy ?? item.manual_buy) && (body.manual_sell ?? item.manual_sell))) {
    throw Object.assign(new Error('Elle fiyat için alış ve satış girilmelidir'), { status: 400 });
  }
  const next = { ...item, ...body };
  if (next.manual_active && next.manual_buy > next.manual_sell) throw Object.assign(new Error('Alış fiyatı satıştan büyük olamaz'), { status: 400 });
  tx(() => {
    q.run(`UPDATE price_items SET margin_type = ?, margin_buy = ?, margin_sell = ?, manual_active = ?, manual_buy = ?, manual_sell = ?, show_on_site = ? WHERE code = ?`,
      next.margin_type, next.margin_buy, next.margin_sell, next.manual_active ? 1 : 0, next.manual_buy ?? null, next.manual_sell ?? null, next.show_on_site ? 1 : 0, item.code);
  });
  recomputeAll();
  audit(req, 'price.update', 'price', item.code, body);
  res.json(q.get('SELECT * FROM price_items WHERE code = ?', item.code));
});

r.post('/refresh', async (req, res) => {
  await fetchPrices();
  audit(req, 'price.refresh', 'price', null, { mode: status.mode });
  res.json({ status, items: q.all('SELECT * FROM price_items ORDER BY sort') });
});

export default r;
