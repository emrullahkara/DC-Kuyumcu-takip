import { Router } from 'express';
import { z } from 'zod';
import { q, localDate, dayStart, dayEnd, getSetting } from '../db/index.js';
import { parse, zs } from '../middleware/validate.js';
import { allow } from '../middleware/auth.js';
import { can } from '../security/permissions.js';
import { priceMap, status as priceStatus } from '../services/prices.js';
import { cashBalances } from '../services/ledger.js';
import { round2, round3 } from '../lib/gold.js';

const r = Router();

/** Gösterge paneli — içerik kullanıcının yetkisine göre süzülür */
r.get('/dashboard', allow('dashboard'), (req, res) => {
  const role = req.user.role;
  const today = localDate();
  const from = dayStart(today), to = dayEnd(today);
  const prices = priceMap();
  const out = { today, prices: q.all('SELECT code, name, buy, sell, source_change AS change, manual_active FROM price_items ORDER BY sort'), price_status: priceStatus };

  if (can(role, 'sales')) {
    const t = q.get("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(has_total),0) AS has FROM sales WHERE status = 'tamam' AND ts BETWEEN ? AND ?", from, to);
    out.sales_today = { count: t.n, total: round2(t.total), has: round3(t.has) };
    const mine = q.get("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM sales WHERE status = 'tamam' AND user_id = ? AND ts BETWEEN ? AND ?", req.user.id, from, to);
    out.my_sales_today = { count: mine.n, total: round2(mine.total) };
    out.recent_sales = q.all(`SELECT s.id, s.no, s.ts, s.total, c.full_name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.status = 'tamam' ORDER BY s.id DESC LIMIT 6`);
  }
  if (can(role, 'purchases')) {
    const p = q.get("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(has_total),0) AS has FROM purchases WHERE status = 'tamam' AND ts BETWEEN ? AND ?", from, to);
    out.purchases_today = { count: p.n, total: round2(p.total), has: round3(p.has) };
  }
  if (can(role, 'cash')) out.cash = cashBalances();
  if (can(role, 'reports')) {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = localDate(new Date(Date.now() - i * 86400_000));
      const row = q.get("SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM sales WHERE status = 'tamam' AND ts BETWEEN ? AND ?", dayStart(d), dayEnd(d));
      days.push({ date: d, total: round2(row.total), count: row.n });
    }
    out.sales_series = days;
  }
  if (can(role, 'products')) {
    out.low_stock = q.all('SELECT id, name, stock_qty, min_stock FROM products WHERE active = 1 AND stock_qty <= min_stock ORDER BY stock_qty LIMIT 10');
    const v = q.get("SELECT COALESCE(SUM(stock_qty * gram * COALESCE(milyem,0)),0) AS has FROM products WHERE active = 1 AND kind <> 'gumus' AND stock_qty > 0");
    out.stock_has = round3(v.has);
    out.stock_value = round2(v.has * (prices.HAS?.buy || 0));
  }
  if (can(role, 'repairs')) {
    out.repairs = {
      open: q.get("SELECT COUNT(*) AS n FROM repairs WHERE status IN ('alindi','atolyede','hazir')").n,
      ready: q.get("SELECT COUNT(*) AS n FROM repairs WHERE status = 'hazir'").n,
      overdue: q.all(`SELECT r.id, r.no, r.item_desc, r.due_date, c.full_name AS customer_name FROM repairs r LEFT JOIN customers c ON c.id = r.customer_id
        WHERE r.status IN ('alindi','atolyede') AND r.due_date IS NOT NULL AND r.due_date <= ? ORDER BY r.due_date LIMIT 10`, today),
    };
  }
  if (can(role, 'inquiries')) out.new_inquiries = q.get("SELECT COUNT(*) AS n FROM inquiries WHERE status = 'yeni'").n;
  if (can(role, 'customers')) {
    const md = today.slice(5);
    out.celebrations = q.all("SELECT id, full_name, phone, CASE WHEN substr(birth_date,6) = ? THEN 'Doğum günü' ELSE 'Evlilik yıldönümü' END AS type FROM customers WHERE anonymized = 0 AND (substr(birth_date,6) = ? OR substr(anniversary_date,6) = ?)", md, md, md);
    out.receivables = {
      TRY: round2(q.get("SELECT COALESCE(SUM(amount),0) AS t FROM customer_ledger WHERE currency = 'TRY'").t),
      HAS: round3(q.get("SELECT COALESCE(SUM(amount),0) AS t FROM customer_ledger WHERE currency = 'HAS'").t),
    };
  }
  res.json(out);
});

/** Dönem raporu */
r.get('/summary', allow('reports'), (req, res) => {
  const f = parse(z.object({ from: zs.date.default(localDate(new Date(Date.now() - 29 * 86400_000))), to: zs.date.default(localDate()) }), req.query);
  const a = dayStart(f.from), b = dayEnd(f.to);
  const prices = priceMap();
  const s = q.get(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(has_total),0) AS has, COALESCE(SUM(cost_total),0) AS cost,
    COALESCE(SUM(discount),0) AS discount FROM sales WHERE status = 'tamam' AND ts BETWEEN ? AND ?`, a, b);
  const byCategory = q.all(`SELECT COALESCE(c.name, 'Diğer') AS name, SUM(i.qty) AS qty, SUM(i.total) AS total, SUM(i.has_equivalent) AS has, SUM(i.total - i.cost_estimate) AS profit
    FROM sale_items i JOIN sales s ON s.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE s.status = 'tamam' AND s.ts BETWEEN ? AND ? GROUP BY c.name ORDER BY total DESC`, a, b);
  const byStaff = q.all(`SELECT COALESCE(st.full_name, u.full_name) AS name, COUNT(*) AS n, SUM(s.total) AS total, SUM(s.total - s.cost_total) AS profit
    FROM sales s LEFT JOIN staff st ON st.id = s.staff_id LEFT JOIN users u ON u.id = s.user_id
    WHERE s.status = 'tamam' AND s.ts BETWEEN ? AND ? GROUP BY COALESCE(st.full_name, u.full_name) ORDER BY total DESC`, a, b);
  const byPayment = q.all(`SELECT m.account, m.currency, m.category, SUM(m.amount) AS amount, SUM(m.amount_try) AS amount_try FROM cash_movements m
    WHERE m.cancelled = 0 AND m.direction = 'in' AND m.ref_type = 'sale' AND m.ts BETWEEN ? AND ? GROUP BY m.account, m.currency, m.category`, a, b);
  const credit = q.get("SELECT COALESCE(SUM(credit_total),0) AS t FROM sales WHERE status = 'tamam' AND ts BETWEEN ? AND ?", a, b).t;
  const topProducts = q.all(`SELECT i.description AS name, SUM(i.qty) AS qty, SUM(i.total) AS total FROM sale_items i JOIN sales s ON s.id = i.sale_id
    WHERE s.status = 'tamam' AND s.ts BETWEEN ? AND ? GROUP BY i.description ORDER BY total DESC LIMIT 10`, a, b);
  const purchases = q.all("SELECT kind, COUNT(*) AS n, SUM(total) AS total, SUM(has_total) AS has FROM purchases WHERE status = 'tamam' AND ts BETWEEN ? AND ? GROUP BY kind", a, b);
  const expenses = q.all(`SELECT category, SUM(amount_try) AS total FROM cash_movements WHERE cancelled = 0 AND direction = 'out' AND ref_type IN ('manual','staff')
    AND ts BETWEEN ? AND ? GROUP BY category ORDER BY total DESC`, a, b);
  const series = q.all(`SELECT substr(ts, 1, 10) AS day, SUM(total) AS total, COUNT(*) AS n FROM sales WHERE status = 'tamam' AND ts BETWEEN ? AND ? GROUP BY day ORDER BY day`, a, b);
  const expenseTotal = expenses.reduce((x, e) => x + e.total, 0);
  const grossProfit = s.total - s.cost;
  res.json({
    from: f.from, to: f.to,
    sales: { count: s.n, total: round2(s.total), has: round3(s.has), cost: round2(s.cost), discount: round2(s.discount), gross_profit: round2(grossProfit),
      gross_profit_has: prices.HAS?.sell ? round3(grossProfit / prices.HAS.sell) : null, credit: round2(credit), avg: s.n ? round2(s.total / s.n) : 0 },
    expenses: { rows: expenses.map((e) => ({ ...e, total: round2(e.total) })), total: round2(expenseTotal) },
    net_profit: round2(grossProfit - expenseTotal),
    by_category: byCategory.map((x) => ({ ...x, total: round2(x.total), has: round3(x.has), profit: round2(x.profit) })),
    by_staff: byStaff.map((x) => ({ ...x, total: round2(x.total), profit: round2(x.profit) })),
    by_payment: byPayment.map((x) => ({ ...x, amount: round2(x.amount), amount_try: round2(x.amount_try) })),
    top_products: topProducts,
    purchases: purchases.map((x) => ({ ...x, total: round2(x.total), has: round3(x.has) })),
    series: series.map((x) => ({ ...x, total: round2(x.total) })),
    business: { identity_threshold_try: getSetting('business', {}).identity_threshold_try },
  });
});

export default r;
