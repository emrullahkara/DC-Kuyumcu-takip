import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Scale, Wrench, LogIn, LogOut, TrendingUp, Wallet, Gem, AlertTriangle, Cake, Heart, MessageCircle,
  MessageSquare, Clock, PackageX, Receipt, RefreshCw, ChevronRight, Coins,
} from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { useApi } from '../../hooks/useApi.js';
import { usePrices } from '../../hooks/usePrices.js';
import { api, A } from '../../lib/api.js';
import { money, has, num, price, date, time, curAmount, waLink, ACCOUNT_LABEL } from '../../lib/format.js';
import { Card, Stat, Loading, ErrorBox, Badge, useToast } from '../../components/ui.jsx';
import { BarChart } from './Reports.jsx';
import './grupA.css';

// Tezgâhta en çok bakılan fiyatlar (sırasıyla)
const KEY_PRICES = ['HAS', 'GRAM', 'A22', 'CEYREK', 'YARIM', 'TAM', 'ATA', 'USD', 'EUR'];
const CURS = ['TRY', 'USD', 'EUR', 'HAS'];

const greeting = () => {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
};

export default function Dashboard() {
  usePageTitle('Gösterge Paneli');
  const { user, site } = useAuth();
  const { data, loading, error, reload } = useApi(A('/reports/dashboard'));

  // Sayfa açık kaldıkça 2 dakikada bir tazele (tezgâhta açık duran ekran)
  useEffect(() => { const t = setInterval(reload, 120000); return () => clearInterval(t); }, [reload]);

  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const d = data;
  const firstName = (user?.full_name || '').split(' ')[0];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="ga-hello">
        <div>
          <h2>{greeting()}{firstName ? `, ${firstName}` : ''}</h2>
          <div className="muted">{new Date(`${d.today}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <button type="button" className="btn sm ghost" onClick={reload} disabled={loading} title="Yenile"><RefreshCw size={15} className={loading ? 'ga-spin' : ''} /> Yenile</button>
      </div>

      <QuickActions />
      <PriceTiles d={d} />

      {/* Günün rakamları */}
      <div className="grid c4">
        {d.sales_today && <Stat tone="gold" icon={TrendingUp} label="Bugünkü satış" value={money(d.sales_today.total, 0)} sub={`${d.sales_today.count} satış · ${has(d.sales_today.has)}`} />}
        {d.purchases_today && <Stat icon={Scale} label="Bugünkü alış" value={money(d.purchases_today.total, 0)} sub={`${d.purchases_today.count} işlem · ${has(d.purchases_today.has)}`} />}
        {d.my_sales_today && d.sales_today && <Stat icon={Receipt} label="Benim satışlarım" value={money(d.my_sales_today.total, 0)} sub={`${d.my_sales_today.count} satış`} />}
        {d.stock_has != null && <Stat icon={Gem} label="Stok has değeri" value={has(d.stock_has)} sub={`≈ ${money(d.stock_value, 0)} (has alıştan)`} />}
        {d.repairs && <Stat icon={Wrench} label="Açık tamir / sipariş" value={d.repairs.open} sub={`${d.repairs.ready} tanesi teslime hazır`} />}
        {d.receivables && <Stat icon={Coins} label="Müşteri alacakları" value={money(d.receivables.TRY, 0)} sub={d.receivables.HAS ? has(d.receivables.HAS) : 'Has alacak yok'} />}
      </div>

      {(d.sales_series || d.cash) && (
        <div className="grid c2" style={{ alignItems: 'start' }}>
          {d.sales_series && (
            <Card title="Son 14 gün satış" actions={<Link to="/panel/raporlar" className="btn sm ghost">Raporlar <ChevronRight size={15} /></Link>}>
              <BarChart height={210} data={d.sales_series.map((x) => ({
                label: `${x.date.slice(8)}.${x.date.slice(5, 7)}`, value: x.total, highlight: x.date === d.today,
                title: `${date(x.date)}: ${money(x.total)} · ${x.count} satış`,
              }))} empty="Son 14 günde satış yok" />
            </Card>
          )}
          {d.cash && <CashCard cash={d.cash} prices={d.prices} />}
        </div>
      )}

      <div className="grid c3" style={{ alignItems: 'start' }}>
        {d.repairs && (
          <Card title={<span className="row" style={{ gap: 8 }}><Clock size={16} /> Geciken tamirler {d.repairs.overdue.length > 0 && <Badge tone="red">{d.repairs.overdue.length}</Badge>}</span>} pad={false}
            actions={<Link to="/panel/tamir" className="btn sm ghost">Tümü</Link>}>
            {d.repairs.overdue.length ? (
              <ul className="ga-list">
                {d.repairs.overdue.map((r) => (
                  <li key={r.id}>
                    <div className="grow"><b className="small">{r.no}</b> · {r.item_desc}<div className="muted xs">{r.customer_name || '—'}</div></div>
                    <Badge tone={r.due_date < d.today ? 'red' : 'amber'}>{r.due_date < d.today ? `${date(r.due_date)}` : 'Bugün'}</Badge>
                  </li>
                ))}
              </ul>
            ) : <div className="card-body muted small">Geciken iş yok.</div>}
          </Card>
        )}
        {d.low_stock && (
          <Card title={<span className="row" style={{ gap: 8 }}><PackageX size={16} /> Düşük stok</span>} pad={false} actions={<Link to="/panel/urunler" className="btn sm ghost">Ürünler</Link>}>
            {d.low_stock.length ? (
              <ul className="ga-list">
                {d.low_stock.map((p) => (
                  <li key={p.id}>
                    <span className="grow">{p.name}</span>
                    <Badge tone={p.stock_qty <= 0 ? 'red' : 'amber'}>{p.stock_qty} / {p.min_stock}</Badge>
                  </li>
                ))}
              </ul>
            ) : <div className="card-body muted small">Stoklar yeterli.</div>}
          </Card>
        )}
        {d.celebrations && <Celebrations rows={d.celebrations} site={site} />}
        {d.new_inquiries != null && (
          <Link to="/panel/talepler" className="card card-pad row between" style={{ textDecoration: 'none' }}>
            <span className="row" style={{ gap: 10 }}><MessageSquare size={20} color="var(--primary)" /><span><b>Yeni web talepleri</b><div className="muted xs">Siteden gelen sorular ve randevular</div></span></span>
            <Badge tone={d.new_inquiries ? 'gold' : ''}>{d.new_inquiries}</Badge>
          </Link>
        )}
        {d.recent_sales?.length > 0 && (
          <Card title="Son satışlar" pad={false} actions={<Link to="/panel/satislar" className="btn sm ghost">Tümü</Link>}>
            <ul className="ga-list">
              {d.recent_sales.map((s) => (
                <li key={s.id}>
                  <Link to={`/panel/satislar/${s.id}`} className="item grow"><b className="small">{s.no}</b> <span className="muted xs">{time(s.ts)}</span><div className="muted xs">{s.customer_name || 'Perakende müşteri'}</div></Link>
                  <b className="num">{money(s.total, 0)}</b>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Hızlı işlem düğmeleri + mesai giriş/çıkış */
function QuickActions() {
  const { can } = useAuth();
  const toast = useToast();
  const me = useApi(A('/staff/me/today'));
  const [busy, setBusy] = useState(false);
  const att = me.data; // null → hesap personele bağlı değil
  const check = async (action) => {
    setBusy(true);
    try {
      const r = await api.post(A('/staff/me/check'), { action });
      toast(action === 'in' ? `Mesai girişi: ${r.time}` : `Mesai çıkışı: ${r.time}`);
      me.reload();
    } catch (err) { toast(err); } finally { setBusy(false); }
  };
  const buttons = [
    can('sales', 'w') && <Link key="s" to="/panel/satis" className="btn primary"><ShoppingCart size={22} /> Satış<small>Hızlı satış ekranı</small></Link>,
    can('purchases', 'w') && <Link key="p" to="/panel/alis?tur=hurda" className="btn"><Scale size={22} /> Hurda alım<small>Eski altın al / bozdur</small></Link>,
    can('repairs', 'w') && <Link key="r" to="/panel/tamir?yeni=1" className="btn"><Wrench size={22} /> Tamir kabul<small>Tamir / sipariş al</small></Link>,
  ].filter(Boolean);
  let attBtn = null;
  if (att) {
    if (!att.check_in) attBtn = <button key="in" type="button" className="btn" onClick={() => check('in')} disabled={busy}><LogIn size={22} color="var(--success)" /> Mesai girişi<small>Henüz giriş yok</small></button>;
    else if (!att.check_out) attBtn = <button key="out" type="button" className="btn" onClick={() => check('out')} disabled={busy}><LogOut size={22} color="var(--danger)" /> Mesai çıkışı<small>Giriş: {att.check_in}</small></button>;
    else attBtn = <div key="done" className="btn" aria-disabled style={{ cursor: 'default' }}><Clock size={22} /> Mesai tamam<small>{att.check_in} – {att.check_out}</small></div>;
  }
  if (!buttons.length && !attBtn) return null;
  return <div className="ga-quick">{buttons}{attBtn}</div>;
}

/** Anlık fiyat kutucukları: panel verisi + canlı akış (SSE) */
function PriceTiles({ d }) {
  const { can } = useAuth();
  const live = usePrices();
  const mode = live.data?.mode || d.price_status?.mode;
  const byCode = Object.fromEntries(d.prices.map((p) => [p.code, p]));
  const tiles = KEY_PRICES.map((c) => byCode[c] && { ...byCode[c], ...(live.byCode[c] ? { buy: live.byCode[c].buy, sell: live.byCode[c].sell, change: live.byCode[c].change } : {}) }).filter(Boolean);
  return (
    <Card title="Anlık fiyatlar" actions={can('prices') && <Link to="/panel/fiyatlar" className="btn sm ghost">Fiyat & Kur <ChevronRight size={15} /></Link>}>
      {mode === 'demo' && <div className="alert warn mb"><AlertTriangle size={18} />Fiyatlar DEMO modunda — gerçek piyasa fiyatı değildir. Satışa başlamadan önce kontrol edin.</div>}
      {mode === 'stale' && <div className="alert warn mb"><AlertTriangle size={18} />Fiyat kaynağına ulaşılamıyor; son alınan fiyatlar gösteriliyor{d.price_status?.lastSuccessAt ? ` (${time(d.price_status.lastSuccessAt)})` : ''}.</div>}
      <div className="price-grid">
        {tiles.map((p) => (
          <div key={p.code} className={`price-tile ${live.flash[p.code] ? `flash-${live.flash[p.code]}` : ''}`}>
            <div className="n row between" style={{ gap: 4 }}>
              <span>{p.name}</span>
              {p.manual_active ? <Badge tone="gold">Sabit</Badge> : p.change != null && <span className={`xs ${p.change >= 0 ? 'up' : 'down'}`}>{p.change >= 0 ? '▲' : '▼'}%{num(Math.abs(p.change))}</span>}
            </div>
            <div className="v"><span className="muted">Alış</span><b>{price(p.buy, p.code)}</b></div>
            <div className="v"><span className="muted">Satış</span><b>{price(p.sell, p.code)}</b></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Kasa bakiyeleri: hesap × para birimi */
function CashCard({ cash, prices }) {
  const pm = Object.fromEntries(prices.map((p) => [p.code, p]));
  const rate = (c) => (c === 'TRY' ? 1 : pm[c]?.buy || 0);
  const accounts = ['kasa', 'banka', 'pos'];
  const total = accounts.reduce((x, a) => x + Object.entries(cash[a] || {}).reduce((y, [c, v]) => y + v * rate(c), 0), 0);
  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Wallet size={16} /> Kasa bakiyeleri</span>} pad={false} actions={<Link to="/panel/kasa" className="btn sm ghost">Kasa <ChevronRight size={15} /></Link>}>
      <div className="table-wrap">
        <table className="ga-bal">
          <thead><tr><th>Hesap</th>{CURS.map((c) => <th key={c}>{c === 'TRY' ? 'TL' : c === 'HAS' ? 'Has' : c}</th>)}</tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a}>
                <td><b>{ACCOUNT_LABEL[a]}</b></td>
                {CURS.map((c) => { const v = cash[a]?.[c] || 0; return <td key={c} className={v < 0 ? 'neg' : ''}>{v ? curAmount(v, c) : <span className="muted">—</span>}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-body row between" style={{ paddingTop: 12, paddingBottom: 14 }}>
        <span className="muted small">Toplam TL karşılığı (alış fiyatından)</span>
        <b className="num" style={{ fontSize: 18 }}>{money(total, 0)}</b>
      </div>
    </Card>
  );
}

/** Bugün doğum günü / evlilik yıldönümü olan müşteriler */
function Celebrations({ rows, site }) {
  const shop = site || 'kuyumcumuz';
  const msg = (r) => (r.type === 'Doğum günü'
    ? `Sayın ${r.full_name}, doğum gününüzü en içten dileklerimizle kutlar, sağlık ve mutluluk dolu nice yıllar dileriz. — ${shop}`
    : `Sayın ${r.full_name}, evlilik yıldönümünüzü kutlar, nice mutlu yıllar dileriz. — ${shop}`);
  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Cake size={16} /> Bugün kutlananlar</span>} pad={false}>
      {rows.length ? (
        <ul className="ga-list">
          {rows.map((r) => (
            <li key={`${r.id}-${r.type}`}>
              {r.type === 'Doğum günü' ? <Cake size={16} color="var(--primary)" /> : <Heart size={16} color="var(--danger)" />}
              <Link to={`/panel/musteriler/${r.id}`} className="item grow"><b className="small">{r.full_name}</b><div className="muted xs">{r.type}</div></Link>
              {r.phone && (
                <a className="btn sm" href={waLink(r.phone, msg(r))} target="_blank" rel="noopener noreferrer" title="WhatsApp ile kutla">
                  <MessageCircle size={15} color="var(--success)" /> Kutla
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : <div className="card-body muted small">Bugün doğum günü ya da yıldönümü olan müşteri yok.</div>}
    </Card>
  );
}
