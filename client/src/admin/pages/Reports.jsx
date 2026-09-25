import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Printer, TrendingUp, Receipt, ShoppingBag, Scale, Wallet, PiggyBank, CreditCard, Coins } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useApi } from '../../hooks/useApi.js';
import { A } from '../../lib/api.js';
import { money, has, num, date, today, daysAgo, METHOD_LABEL, ACCOUNT_LABEL, curAmount } from '../../lib/format.js';
import { Card, Stat, Loading, Empty, ErrorBox, Field } from '../../components/ui.jsx';
import { EXPENSE_LABEL } from './Cash.jsx';
import './grupA.css';

// ---------- Ortak grafik yardımcıları (Gösterge paneli de kullanır) ----------

const compactFmt = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
/** Eksen etiketi için kısa sayı: 125.000 → "125 B" */
export const compact = (v) => compactFmt.format(v || 0);

/** Kapsayıcının piksel genişliğini izler (SVG metinleri ölçeklenmesin diye) */
export function useWidth(initial = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth || initial);
    if (!('ResizeObserver' in window)) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w];
}

/** Y ekseni için "güzel" üst sınır ve adımlar */
export function niceTicks(max, count = 4) {
  if (!max || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/**
 * Dikey çubuk grafik (SVG). data: [{ label, value, title?, highlight? }]
 * Etiketler kalabalıksa yalnızca bir kısmı yazılır; her çubuğun title ipucu vardır.
 */
export function BarChart({ data, height = 200, format = money, empty = 'Bu aralıkta veri yok' }) {
  const [ref, width] = useWidth();
  if (!data?.length || data.every((d) => !d.value)) return <div ref={ref}><Empty>{empty}</Empty></div>;
  const padL = 52, padR = 8, padT = 10, padB = 26;
  const ticks = niceTicks(Math.max(...data.map((d) => d.value)));
  const top = ticks[ticks.length - 1];
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const slot = innerW / data.length;
  const bw = Math.max(2, Math.min(38, slot * 0.7));
  const every = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44))); // etiket sıklığı
  const y = (v) => padT + innerH - (v / top) * innerH;
  return (
    <div ref={ref}>
      <svg className="ga-chart" width={width} height={height} role="img" aria-label="Çubuk grafik">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / top) * innerH);
          return (
            <g key={i}>
              <rect className={`bar ${d.highlight ? 'today' : ''}`} x={x} y={padT + innerH - h} width={bw} height={h} rx={Math.min(4, bw / 3)}>
                <title>{d.title || `${d.label}: ${format(d.value)}`}</title>
              </rect>
              {i % every === 0 && <text x={x + bw / 2} y={height - 8} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Yatay çubuk listesi (CSS .hbar) */
export function HBars({ rows, format = money, tone = '' }) {
  if (!rows?.length) return <Empty>Kayıt yok</Empty>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  return (
    <div className="ga-hbar">
      {rows.map((r, i) => (
        <div className="hbar" key={i} title={r.title || `${r.label}: ${format(r.value)}`}>
          <span>{r.label}</span>
          <div className="track"><div className={`fill ${tone}`} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} /></div>
          <span className="val">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Tarih aralığı yardımcıları ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const RANGES = [
  ['today', 'Bugün', () => [today(), today()]],
  ['7', '7 gün', () => [daysAgo(6), today()]],
  ['30', '30 gün', () => [daysAgo(29), today()]],
  ['month', 'Bu ay', () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), today()]; }],
  ['prev', 'Geçen ay', () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]; }],
  ['year', 'Bu yıl', () => [`${new Date().getFullYear()}-01-01`, today()]],
];
const PURCHASE_KIND = { hurda: 'Hurda altın', sarrafiye: 'Sarrafiye', urun: 'Ürün (tedarikçi)' };
const PAY_CATEGORY = { satis: 'Satış', takas: 'Eski altın takas' };

/** from–to arasındaki tüm günleri boşlukları sıfırla doldurarak döndür */
function fillDays(series, from, to) {
  const map = Object.fromEntries((series || []).map((s) => [s.day, s]));
  const out = [];
  const end = new Date(`${to}T00:00:00`);
  for (let d = new Date(`${from}T00:00:00`); d <= end && out.length < 400; d.setDate(d.getDate() + 1)) {
    const k = iso(d);
    out.push({ day: k, total: map[k]?.total || 0, n: map[k]?.n || 0 });
  }
  return out;
}

export default function Reports() {
  usePageTitle('Raporlar');
  const [range, setRange] = useState('30');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data, loading, error } = useApi(from && to && from <= to ? A(`/reports/summary?from=${from}&to=${to}`) : null);

  const pick = (key) => { const r = RANGES.find((x) => x[0] === key); const [a, b] = r[2](); setRange(key); setFrom(a); setTo(b); };

  // Günlük seriyi hazırla: uzun aralıkta (>62 gün) aylık topla
  const seriesBars = useMemo(() => {
    if (!data) return [];
    const days = fillDays(data.series, data.from, data.to);
    if (days.length > 62) {
      const m = {};
      for (const d of days) { const k = d.day.slice(0, 7); m[k] ??= { total: 0, n: 0 }; m[k].total += d.total; m[k].n += d.n; }
      return Object.entries(m).map(([k, v]) => ({ label: `${k.slice(5)}.${k.slice(2, 4)}`, value: v.total, title: `${k}: ${money(v.total)} · ${v.n} satış` }));
    }
    return days.map((d) => ({ label: `${d.day.slice(8)}.${d.day.slice(5, 7)}`, value: d.total, title: `${date(d.day)}: ${money(d.total)} · ${d.n} satış`, highlight: d.day === today() }));
  }, [data]);

  const invalid = from > to;

  return (
    <div className="ga-report">
      {/* Filtre çubuğu */}
      <div className="card card-pad mb no-print">
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="seg" role="radiogroup" aria-label="Tarih kısayolları">
              {RANGES.map(([k, l]) => <button key={k} type="button" className={range === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}
            </div>
            <div className="ga-range">
              <Field label="Başlangıç"><input className="input" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setRange(''); }} /></Field>
              <Field label="Bitiş"><input className="input" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setRange(''); }} /></Field>
            </div>
          </div>
          <button type="button" className="btn" onClick={() => window.print()} disabled={!data}><Printer size={18} /> Yazdır</button>
        </div>
        {invalid && <div className="alert warn mt-s">Başlangıç tarihi bitişten sonra olamaz.</div>}
      </div>

      <div className="ga-print-head">
        <h2>Dönem Raporu</h2>
        <div className="muted">{date(from)} – {date(to)} · Yazdırma: {new Date().toLocaleString('tr-TR')}</div>
      </div>

      <ErrorBox error={error} />
      {loading && !data && <Loading />}
      {data && <ReportBody data={data} seriesBars={seriesBars} />}
    </div>
  );
}

function ReportBody({ data, seriesBars }) {
  const s = data.sales;
  const purchaseTotal = data.purchases.reduce((x, p) => x + (p.total || 0), 0);
  const purchaseHas = data.purchases.reduce((x, p) => x + (p.has || 0), 0);
  const margin = s.total ? (s.gross_profit / s.total) * 100 : 0;

  // Ödeme türleri: kasa hareketlerinden (hesap + para birimi + kategori)
  const payRows = data.by_payment.map((p) => {
    let label;
    if (p.category === 'takas') label = 'Eski altın (takas)';
    else if (p.currency !== 'TRY') label = `Döviz — ${p.currency}`;
    else if (p.account === 'pos') label = METHOD_LABEL.kart;
    else if (p.account === 'banka') label = METHOD_LABEL.havale;
    else label = METHOD_LABEL.nakit;
    return { label, value: p.amount_try, title: `${label} (${ACCOUNT_LABEL[p.account] || p.account}, ${PAY_CATEGORY[p.category] || p.category}): ${curAmount(p.amount, p.currency)} ≈ ${money(p.amount_try)}` };
  });
  if (s.credit > 0) payRows.push({ label: 'Veresiye / cari', value: s.credit, title: `Veresiye: ${money(s.credit)}` });
  payRows.sort((a, b) => b.value - a.value);

  return (
    <>
      {/* Özet kutucukları */}
      <div className="grid c4 mb">
        <Stat tone="gold" icon={TrendingUp} label="Satış toplamı" value={money(s.total, 0)} sub={`${s.count} satış · ${has(s.has)}`} />
        <Stat icon={Receipt} label="Ortalama sepet" value={money(s.avg, 0)} sub={s.discount ? `İndirim: ${money(s.discount, 0)}` : 'İndirim yok'} />
        <Stat icon={Coins} label="Brüt kâr" value={<span className={s.gross_profit < 0 ? 'down' : ''}>{money(s.gross_profit, 0)}</span>}
          sub={`${s.gross_profit_has != null ? has(s.gross_profit_has) : '—'} · %${num(margin)} marj`} />
        <Stat icon={PiggyBank} label="Net kâr" value={<span className={data.net_profit < 0 ? 'down' : 'up'}>{money(data.net_profit, 0)}</span>} sub={`Giderler: ${money(data.expenses.total, 0)}`} />
      </div>
      <div className="grid c4 mb">
        <Stat icon={ShoppingBag} label="Satılan maliyet" value={money(s.cost, 0)} sub="Satılan malın tahmini maliyeti" />
        <Stat icon={Wallet} label="Giderler" value={money(data.expenses.total, 0)} sub={`${data.expenses.rows.length} kalem`} />
        <Stat icon={CreditCard} label="Veresiye" value={money(s.credit, 0)} sub="Bu dönemde veresiye yazılan" />
        <Stat icon={Scale} label="Alışlar" value={money(purchaseTotal, 0)} sub={`${has(purchaseHas)} karşılığı`} />
      </div>

      <Card title={`Günlük satış (${date(data.from)} – ${date(data.to)})`} className="mb">
        <BarChart data={seriesBars} height={220} />
      </Card>

      <div className="grid c2 mb">
        <Card title="Kategoriye göre satış">
          <HBars rows={data.by_category.map((c) => ({ label: c.name, value: c.total, title: `${c.name}: ${money(c.total)} · ${num(c.qty)} adet · ${has(c.has)} · kâr ${money(c.profit)}` }))} format={(v) => money(v, 0)} />
        </Card>
        <Card title="Ödeme türüne göre tahsilat">
          <HBars rows={payRows} format={(v) => money(v, 0)} tone="alt" />
        </Card>
      </div>

      <div className="grid c2 mb">
        <Card title="Personele göre" pad={false}>
          {data.by_staff.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Personel</th><th className="right">Adet</th><th className="right">Satış</th><th className="right ga-hide-sm">Kâr</th></tr></thead>
              <tbody>{data.by_staff.map((r, i) => (
                <tr key={i}><td>{r.name || '—'}</td><td className="right num">{r.n}</td><td className="right num">{money(r.total, 0)}</td><td className="right num ga-hide-sm">{money(r.profit, 0)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>Satış yok</Empty>}
        </Card>
        <Card title="En çok satan ürünler" pad={false}>
          {data.top_products.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>#</th><th>Ürün</th><th className="right">Adet</th><th className="right">Tutar</th></tr></thead>
              <tbody>{data.top_products.map((r, i) => (
                <tr key={i}><td className="muted">{i + 1}</td><td>{r.name}</td><td className="right num">{num(r.qty)}</td><td className="right num">{money(r.total, 0)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>Satış yok</Empty>}
        </Card>
      </div>

      <div className="grid c2 mb">
        <Card title="Alışlar (hurda / sarrafiye / ürün)" pad={false}>
          {data.purchases.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Tür</th><th className="right">Adet</th><th className="right">Has</th><th className="right">Tutar</th></tr></thead>
              <tbody>{data.purchases.map((r) => (
                <tr key={r.kind}><td>{PURCHASE_KIND[r.kind] || r.kind}</td><td className="right num">{r.n}</td><td className="right num">{has(r.has)}</td><td className="right num">{money(r.total, 0)}</td></tr>
              ))}</tbody>
              <tfoot><tr><td><b>Toplam</b></td><td className="right num"><b>{data.purchases.reduce((x, r) => x + r.n, 0)}</b></td><td className="right num"><b>{has(purchaseHas)}</b></td><td className="right num"><b>{money(purchaseTotal, 0)}</b></td></tr></tfoot>
            </table></div>
          ) : <Empty>Bu dönemde alış yok</Empty>}
        </Card>
        <Card title="Gider kalemleri">
          <HBars rows={data.expenses.rows.map((e) => ({ label: EXPENSE_LABEL[e.category] || e.category, value: e.total }))} format={(v) => money(v, 0)} tone="red" />
          {data.expenses.rows.length > 0 && <div className="row between mt small"><span className="muted">Toplam gider</span><b className="num">{money(data.expenses.total)}</b></div>}
        </Card>
      </div>
    </>
  );
}
