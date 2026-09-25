import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, app, request } from './helpers.js';
import { productPricing, scrapValue } from '../src/lib/gold.js';
import { normalizeSource, parseTrNumber, applyMargin } from '../src/services/prices.js';
import { q } from '../src/db/index.js';

test('kuyumcu fiyat formülü: gram × has × (milyem + işçilik)', () => {
  const prices = { HAS: { buy: 4800, sell: 5000 } };
  const p = { gram: 10, karat: '22', milyem: 0.916, labor_milyem: 0.03, labor_tl: 0, stone_price: 0, kind: 'taki' };
  // 10 × 5000 × 0.946 = 47300
  assert.equal(productPricing(p, prices, 1).unit, 47300);
  assert.equal(productPricing(p, prices, 1).has, 9.16);
  assert.equal(productPricing({ ...p, labor_tl: 3 }, prices, 5).unit, 47305);
  assert.equal(productPricing({ ...p, price_mode: 'fixed', fixed_price: 999 }, prices).unit, 999);
});

test('hurda değeri: fire düşülür', () => {
  const v = scrapValue({ gram: 10, karat: '22', fire_pct: 2 }, 4800);
  assert.equal(v.has, 8.977); // 10 × 0.98 × 0.916
  assert.equal(v.value, 43089.6);
});

test('fiyat kaynağı: Türkçe biçim ve eksik ayar türetme', () => {
  assert.equal(parseTrNumber('4.850,12'), 4850.12);
  assert.equal(parseTrNumber('%0,45'), 0.45);
  const n = normalizeSource({
    'Update_Date': '2026-09-25', 'gram-altin': { 'Alış': '4.800,00', 'Satış': '4.850,00', 'Değişim': '%0,40', 'Tür': 'Altın' },
    'ceyrek-altin': { 'Alış': '7.800,00', 'Satış': '8.000,00' }, USD: { Buying: '41,50', Selling: '41,60' },
  });
  assert.equal(n.GRAM.sell, 4850);
  assert.equal(n.CEYREK.buy, 7800);
  assert.equal(n.USD.buy, 41.5);
  assert.equal(n.HAS.sell, 4850);
  assert.equal(n.A14.sell, Math.round(4850 * 0.585 * 100) / 100);
  const m = applyMargin({ code: 'HAS', category: 'altin', source_buy: 1000, source_sell: 1000, margin_type: 'pct', margin_buy: 1, margin_sell: 2 });
  assert.deepEqual(m, { buy: 990, sell: 1020 });
  assert.deepEqual(applyMargin({ manual_active: 1, manual_buy: 5, manual_sell: 6 }), { buy: 5, sell: 6 });
});

test('satış: stok düşer, kasa artar, sunucu fiyatı esas alınır', async () => {
  const s = await login('satis');
  const before = q.get('SELECT stock_qty FROM products WHERE id = 25');
  const quote = await s.post('/api/admin/sales/quote', { items: [{ product_id: 25, qty: 2 }] });
  assert.equal(quote.status, 200);
  const total = quote.body.total;
  const r = await s.post('/api/admin/sales', { items: [{ product_id: 25, qty: 2 }], payments: [{ method: 'nakit', amount: total }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(q.get('SELECT stock_qty FROM products WHERE id = 25').stock_qty, before.stock_qty - 2);
  const detail = await s.get(`/api/admin/sales/${r.body.id}`);
  assert.equal(detail.body.items[0].total, total);
  assert.equal(detail.body.payments[0].amount, total);
});

test('satış: eksik ödeme reddedilir', async () => {
  const s = await login('satis');
  const r = await s.post('/api/admin/sales', { items: [{ product_id: 25, qty: 1 }], payments: [{ method: 'nakit', amount: 10 }] });
  assert.equal(r.status, 400);
});

test('satış personeli indirim sınırını aşamaz, müdür aşabilir', async () => {
  const s = await login('satis');
  const quote = await s.post('/api/admin/sales/quote', { items: [{ product_id: 10, qty: 1 }] });
  const discount = Math.round(quote.body.total * 0.1);
  const body = { items: [{ product_id: 10, qty: 1 }], discount, payments: [{ method: 'nakit', amount: quote.body.total - discount }] };
  const r = await s.post('/api/admin/sales', body);
  assert.equal(r.status, 403);
  const m = await login('mudur');
  const ok = await m.post('/api/admin/sales', body);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

test('MASAK eşiği: kimliksiz yüksek tutarlı satış engellenir', async () => {
  const s = await login('patron');
  const quote = await s.post('/api/admin/sales/quote', { items: [{ product_id: 25, qty: 30 }] });
  assert.equal(quote.body.identity_required, true);
  const r = await s.post('/api/admin/sales', { items: [{ product_id: 25, qty: 30 }], payments: [{ method: 'havale', amount: quote.body.total }] });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'IDENTITY_REQUIRED');
  const withId = await s.post('/api/admin/sales', { customer_id: 1, items: [{ product_id: 25, qty: 30 }], payments: [{ method: 'havale', amount: quote.body.total }] });
  assert.equal(withId.status, 201, JSON.stringify(withId.body));
});

test('eski altın takası + veresiye (gram) ile satış ve iptal', async () => {
  const s = await login('patron');
  const quote = await s.post('/api/admin/sales/quote', { customer_id: 2, items: [{ product_id: 10, qty: 1 }], payments: [{ method: 'altin', karat: '22', gram: 5 }] });
  const tradeTry = quote.body.payments[0].amount_try;
  const remaining = quote.body.total - tradeTry;
  const hasPrice = quote.body.rates.HAS.sell;
  const debtHas = Math.round((remaining / hasPrice) * 1000) / 1000;
  const r = await s.post('/api/admin/sales', {
    customer_id: 2, items: [{ product_id: 10, qty: 1 }],
    payments: [{ method: 'altin', karat: '22', gram: 5 }, { method: 'veresiye', currency: 'HAS', amount: debtHas }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const c = await s.get('/api/admin/customers/2');
  assert.ok(c.body.balances.HAS >= debtHas - 0.001);
  const stock = q.get('SELECT stock_qty FROM products WHERE id = 10').stock_qty;
  const cancel = await s.post(`/api/admin/sales/${r.body.id}/cancel`, { reason: 'Müşteri vazgeçti' });
  assert.equal(cancel.status, 200);
  assert.equal(q.get('SELECT stock_qty FROM products WHERE id = 10').stock_qty, stock + 1);
  const c2 = await s.get('/api/admin/customers/2');
  assert.ok(Math.abs(c2.body.balances.HAS - (c.body.balances.HAS - debtHas)) < 0.002);
  const satis = await login('satis');
  assert.equal((await satis.post(`/api/admin/sales/${r.body.id}/cancel`, { reason: 'deneme' })).status, 403);
});

test('hurda alım: kasaya has girer, müşteriye nakit çıkar', async () => {
  const s = await login('satis');
  const quote = await s.post('/api/admin/purchases/quote', { kind: 'hurda', items: [{ karat: '14', gram: 12.5, fire_pct: 1 }] });
  assert.equal(quote.status, 200);
  const r = await s.post('/api/admin/purchases', { kind: 'hurda', customer_id: 6, items: [{ karat: '14', gram: 12.5, fire_pct: 1 }], payments: [{ method: 'nakit', amount: quote.body.total }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.has_total, 7.239); // 12.5 × 0.99 × 0.585
});

test('toptancıdan ürün alımı has cariye yazılır, ödeme bakiyeyi düşer', async () => {
  const s = await login('patron');
  const sup = q.get('SELECT id FROM suppliers LIMIT 1').id;
  const before = (await s.get(`/api/admin/suppliers/${sup}`)).body.balances.HAS || 0;
  const r = await s.post('/api/admin/purchases', { kind: 'urun', supplier_id: sup, items: [{ product_id: 14, qty: 3, unit_has: 1.6 }], settle_has: 'cari' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const after = (await s.get(`/api/admin/suppliers/${sup}`)).body.balances.HAS;
  assert.ok(Math.abs(after - before - 4.8) < 0.001);
  const pay = await s.post(`/api/admin/suppliers/${sup}/payment`, { currency: 'HAS', amount: 4.8 });
  assert.equal(pay.status, 201);
  assert.ok(Math.abs(pay.body.balances.HAS - before) < 0.001);
});

test('tamir: kapora, durum akışı, teslimde kalan tahsilat', async () => {
  const s = await login('atolye');
  const r = await s.post('/api/admin/repairs', { kind: 'tamir', customer_id: 1, item_desc: 'Kolye klips değişimi', karat: '14', gram_in: 3.2, estimated_price: 500, deposit: 100 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await s.post(`/api/admin/repairs/${r.body.id}/status`, { status: 'teslim' })).status, 400);
  assert.equal((await s.post(`/api/admin/repairs/${r.body.id}/status`, { status: 'atolyede' })).status, 200);
  assert.equal((await s.post(`/api/admin/repairs/${r.body.id}/status`, { status: 'hazir' })).status, 200);
  assert.equal((await s.post(`/api/admin/repairs/${r.body.id}/status`, { status: 'teslim', final_price: 550 })).status, 200);
  const d = await s.get(`/api/admin/repairs/${r.body.id}`);
  assert.equal(d.body.payments.reduce((a, p) => a + p.amount, 0), 550);
});

test('kasa: gider, döviz bozdurma ve gün sonu', async () => {
  const s = await login('muhasebe');
  assert.equal((await s.post('/api/admin/cash/movements', { direction: 'out', account: 'kasa', amount: 500, category: 'mutfak' })).status, 201);
  assert.equal((await s.post('/api/admin/cash/movements', { direction: 'out', account: 'kasa', amount: 500, category: 'uydurma' })).status, 400);
  const ex = await s.post('/api/admin/cash/exchange', { side: 'buy', currency: 'USD', amount: 100 });
  assert.equal(ex.status, 201);
  const bal = (await s.get('/api/admin/cash/balances')).body.balances.kasa;
  const close = await s.post('/api/admin/cash/day-close', { counted: { TRY: bal.TRY - 50, USD: bal.USD } });
  assert.equal(close.status, 201, JSON.stringify(close.body));
  assert.equal(close.body.diff.TRY, -50);
  assert.equal((await s.post('/api/admin/cash/day-close', { counted: { TRY: 1 } })).status, 400);
});

test('personel: avans kasadan çıkar, bordroda düşülür', async () => {
  const s = await login('patron');
  const r = await s.post('/api/admin/staff/2/transactions', { type: 'avans', amount: 2000, account: 'kasa' });
  assert.equal(r.status, 201);
  const d = await s.get('/api/admin/staff/2');
  assert.ok(d.body.payroll.advances >= 2000);
  const me = await login('satis');
  assert.equal((await me.post('/api/admin/staff/me/check', { action: 'in' })).status, 200);
  assert.equal((await me.post('/api/admin/staff/me/check', { action: 'in' })).status, 400);
});

test('web sitesi talebi: bot tuzağı ve KVKK onayı', async () => {
  const bot = await request(app).post('/api/public/inquiries').send({ name: 'Bot', phone: '05000000000', website: 'spam', consent: true });
  assert.equal(bot.status, 400);
  const noConsent = await request(app).post('/api/public/inquiries').send({ name: 'Ali Veli', phone: '05321234567' });
  assert.equal(noConsent.status, 400);
  const ok = await request(app).post('/api/public/inquiries').send({ name: 'Ali Veli', phone: '05321234567', message: 'Merhaba', product_id: 1, consent: true });
  assert.equal(ok.status, 201);
});

test('raporlar ve gösterge paneli', async () => {
  const s = await login('patron');
  const d = await s.get('/api/admin/reports/dashboard');
  assert.equal(d.status, 200);
  assert.ok(d.body.cash.kasa.TRY > 0);
  assert.equal(d.body.sales_series.length, 14);
  const rep = await s.get('/api/admin/reports/summary');
  assert.equal(rep.status, 200);
  assert.ok(rep.body.sales.count > 0);
  assert.ok(rep.body.by_category.length > 0);
});

test('fiyat makası güncellenir ve elle fiyat sabitlenir', async () => {
  const s = await login('patron');
  const r = await s.put('/api/admin/prices/CEYREK', { manual_active: true, manual_buy: 7000, manual_sell: 7100 });
  assert.equal(r.status, 200);
  assert.equal(r.body.sell, 7100);
  const pub = await request(app).get('/api/public/prices');
  assert.equal(pub.body.items.find((i) => i.code === 'CEYREK').sell, 7100);
  await s.put('/api/admin/prices/CEYREK', { manual_active: false });
  const satis = await login('satis');
  assert.equal((await satis.put('/api/admin/prices/CEYREK', { margin_sell: 5 })).status, 403);
});
