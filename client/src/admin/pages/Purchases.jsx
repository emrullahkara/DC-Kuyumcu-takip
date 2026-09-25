import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Scale, Coins, Truck, AlertTriangle, CheckCircle2, Banknote, Search } from 'lucide-react';
import { api, A } from '../../lib/api.js';
import { money, gram, has, dateTime, today, daysAgo, KARATS, curAmount } from '../../lib/format.js';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { useApi } from '../../hooks/useApi.js';
import { usePrices } from '../../hooks/usePrices.js';
import { Modal, useToast, useConfirm, Input, Select, Loading, Empty, ErrorBox, Badge, Card, Seg } from '../../components/ui.jsx';
import { CustomerPicker, FieldBox, useDebounced, toNum, newKey } from './Pos.jsx';
import './grupB.css';

const KIND = { hurda: ['Hurda altın', 'amber'], sarrafiye: ['Sarrafiye', 'gold'], urun: ['Toptancı', 'blue'] };
const SARRAFIYE = [
  ['CEYREK', 'Çeyrek'], ['YARIM', 'Yarım'], ['TAM', 'Tam'], ['CUMHURIYET', 'Cumhuriyet'],
  ['ATA', 'Ata'], ['RESAT', 'Reşat'], ['GREMSE', 'Gremse'], ['GRAM', 'Gram altın'],
];
const PAY_OPTS = [['nakit', 'Nakit'], ['havale', 'Havale/EFT'], ['doviz', 'Döviz'], ['cari', 'Cariye yaz']];

const IDENTITY_MSG = 'Kimlik tespiti gerekli: bu tutar yasal eşiğin (MASAK) üzerinde. TC kimlik numarası kayıtlı bir müşteri seçin '
  + 'ya da müşteri kartına TC numarasını ekleyip tekrar deneyin.';

const hurdaRow = () => ({ key: newKey(), karat: '22', gram: '', fire_pct: '', unit_price: '', description: '' });
const sarrafRow = (code = 'CEYREK') => ({ key: newKey(), price_code: code, qty: '1', unit_price: '' });
const urunRow = () => ({ key: newKey(), product_id: '', qty: '1', unit_has: '', unit_tl: '' });

export default function Purchases() {
  usePageTitle('Alış & Bozdurma');
  const { can } = useAuth();
  const canWrite = can('purchases', 'w');
  const [tab, setTab] = useState('hurda');
  const [refresh, setRefresh] = useState(0);
  const tabs = [
    ['hurda', 'Hurda altın alımı', Scale],
    ['sarrafiye', 'Sarrafiye geri alım', Coins],
    ...(can('suppliers') && can('products') ? [['urun', 'Toptancıdan alım', Truck]] : []),
  ];

  return (
    <div className="stack" style={{ gap: 16 }}>
      {canWrite && (
        <>
          <div className="tabs" role="tablist" style={{ marginBottom: 0 }}>
            {tabs.map(([k, l, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                <Icon size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{l}
              </button>
            ))}
          </div>
          {tab === 'urun'
            ? <SupplierPurchase key="urun" onDone={() => setRefresh((x) => x + 1)} />
            : <CustomerPurchase key={tab} kind={tab} onDone={() => setRefresh((x) => x + 1)} />}
        </>
      )}
      <History refresh={refresh} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Müşteriden alım: hurda + sarrafiye                                  */
/* ------------------------------------------------------------------ */
function CustomerPurchase({ kind, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { byCode } = usePrices();
  const [rows, setRows] = useState(() => [kind === 'hurda' ? hurdaRow() : sarrafRow()]);
  const [customer, setCustomer] = useState(null);
  const [pays, setPays] = useState([]);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState(null);
  const [qErr, setQErr] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));

  // Sunucuya gönderilecek kalemler (eksik satırlar atlanır)
  const items = useMemo(() => rows.map((r) => {
    if (kind === 'hurda') {
      const g = toNum(r.gram);
      if (!(g > 0) || !r.karat) return null;
      return { karat: r.karat, gram: g, fire_pct: toNum(r.fire_pct), unit_price: toNum(r.unit_price) ?? undefined, description: r.description.trim() || undefined };
    }
    const qty = parseInt(r.qty, 10);
    if (!r.price_code || !(qty > 0)) return null;
    return { price_code: r.price_code, qty, unit_price: toNum(r.unit_price) ?? undefined };
  }), [rows, kind]);
  const valid = items.filter(Boolean);
  const dKey = useDebounced(JSON.stringify(valid), 350);
  const stale = dKey !== JSON.stringify(valid);

  useEffect(() => {
    const its = JSON.parse(dKey);
    if (!its.length) { setQuote(null); setQErr(null); return; }
    let alive = true;
    api.post(A('/purchases/quote'), { kind, items: its })
      .then((q) => { if (alive) { setQuote(q); setQErr(null); } })
      .catch((e) => alive && setQErr(e));
    return () => { alive = false; };
  }, [dKey, kind]);

  // Ödeme satırlarının TL karşılığı (döviz için anlık satış kuru ile yaklaşık; kesin hesap sunucuda)
  const rateOf = (p) => (p.method === 'doviz' ? byCode[p.currency]?.sell : p.method === 'cari' && p.currency === 'HAS' ? quote?.rates?.HAS?.buy : 1);
  const paidTry = pays.reduce((s, p) => s + (toNum(p.amount) || 0) * (rateOf(p) || 0), 0);
  const total = quote?.total || 0;
  const remaining = Math.round((total - paidTry) * 100) / 100;
  const addPay = (method) => setPays((ps) => [...ps, {
    key: newKey(), method, currency: method === 'doviz' ? 'USD' : 'TRY', amount: method !== 'doviz' && remaining > 0 ? String(remaining) : '',
  }]);
  const setPay = (key, k, v) => setPays((ps) => ps.map((p) => (p.key === key ? { ...p, [k]: v, ...(k === 'currency' ? { amount: '' } : {}) } : p)));
  const addRemainingCash = () => {
    const ex = pays.find((p) => p.method === 'nakit');
    if (ex) setPay(ex.key, 'amount', String(Math.round(((toNum(ex.amount) || 0) + remaining) * 100) / 100));
    else addPay('nakit');
  };
  const needsCustomer = pays.some((p) => p.method === 'cari') && !customer;

  const submit = async () => {
    setErr(null);
    const ok = await confirm(`${money(total)} tutarındaki ${kind === 'hurda' ? 'hurda altın alımı' : 'sarrafiye geri alımı'} kaydedilsin mi? Ödeme kasadan çıkacaktır.`, { ok: 'Kaydet' });
    if (!ok) return;
    setBusy(true);
    try {
      const payments = pays.map((p) => ({ method: p.method, currency: p.method === 'doviz' ? p.currency : p.method === 'cari' && p.currency === 'HAS' ? 'HAS' : 'TRY', amount: toNum(p.amount) }))
        .filter((p) => p.amount > 0);
      const res = await api.post(A('/purchases'), { kind, customer_id: customer?.id ?? null, items: valid, payments, note: note.trim() || null });
      toast(`Alış kaydedildi: ${res.no}`);
      setDone(res);
      setRows([kind === 'hurda' ? hurdaRow() : sarrafRow()]); setPays([]); setCustomer(null); setNote(''); setQuote(null);
      onDone();
    } catch (e) {
      setErr(e.code === 'IDENTITY_REQUIRED' ? new Error(IDENTITY_MSG) : e);
      toast(e.code === 'IDENTITY_REQUIRED' ? IDENTITY_MSG : e, 'error');
    } finally { setBusy(false); }
  };

  const qItem = (i) => {
    // Teklif yanıtındaki kalemi, gönderilen geçerli satırın sırasıyla eşleştir
    const idx = items.slice(0, i + 1).filter(Boolean).length - 1;
    return items[i] && !stale ? quote?.items?.[idx] : null;
  };

  return (
    <div className="grid c2" style={{ alignItems: 'start' }}>
      <Card title={kind === 'hurda' ? 'Tartılan parçalar' : 'Geri alınan sarrafiye'}
        actions={<button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, kind === 'hurda' ? hurdaRow() : sarrafRow()])}><Plus size={15} />Satır</button>}>
        <div className="stack" style={{ gap: 10 }}>
          {kind === 'sarrafiye' && (
            <div className="gb-tile-grid">
              {SARRAFIYE.map(([code, label]) => {
                const p = byCode[code];
                const on = rows.some((r) => r.price_code === code);
                return (
                  <button type="button" key={code} className={`gb-tile ${on ? 'on' : ''}`} onClick={() => {
                    const ex = rows.find((r) => r.price_code === code);
                    if (ex) setRow(ex.key, 'qty', String((parseInt(ex.qty, 10) || 0) + 1));
                    else setRows((rs) => (rs.length === 1 && rs[0].price_code === 'CEYREK' && !on && rs[0].qty === '1' && !rs[0].touched ? [sarrafRow(code)] : [...rs, sarrafRow(code)]));
                  }}>
                    <b>{label}</b><small>Alış {p ? money(p.buy) : '—'}</small>
                  </button>
                );
              })}
            </div>
          )}
          {rows.map((r, i) => {
            const qi = qItem(i);
            return kind === 'hurda' ? (
              <div className="gb-line" key={r.key}>
                <Select label="Ayar" value={r.karat} onChange={(e) => setRow(r.key, 'karat', e.target.value)} options={KARATS.filter((k) => k !== '925').map((k) => [k, `${k} ayar`])} />
                <Input label="Gram" inputMode="decimal" value={r.gram} onChange={(e) => setRow(r.key, 'gram', e.target.value)} placeholder="0,00" autoFocus={i === rows.length - 1} />
                <Input label="Fire %" inputMode="decimal" value={r.fire_pct} onChange={(e) => setRow(r.key, 'fire_pct', e.target.value)} placeholder="0" />
                <Input label="Pazarlık ₺" hint="isteğe bağlı" inputMode="decimal" value={r.unit_price} onChange={(e) => setRow(r.key, 'unit_price', e.target.value)} placeholder={qi ? String(Math.round(qi.total)) : ''} />
                <button type="button" className="btn ghost icon" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Satırı sil"><Trash2 size={16} /></button>
                {qi && <div className="xs muted" style={{ gridColumn: '1 / -1' }}>{gram(qi.gram)}{qi.fire_pct ? ` (−%${qi.fire_pct} fire)` : ''} × {qi.milyem} milyem = <b>{has(qi.has_equivalent)}</b> → <b>{money(qi.total)}</b></div>}
              </div>
            ) : (
              <div className="gb-line" key={r.key}>
                <Select label="Tür" value={r.price_code} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, price_code: e.target.value, touched: true } : x)))} options={SARRAFIYE} />
                <Input label="Adet" inputMode="numeric" value={r.qty} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, qty: e.target.value.replace(/\D/g, ''), touched: true } : x)))} />
                <Input label="Birim ₺" hint="isteğe bağlı" inputMode="decimal" value={r.unit_price} onChange={(e) => setRow(r.key, 'unit_price', e.target.value)} placeholder={qi ? String(qi.unit_price) : ''} />
                <button type="button" className="btn ghost icon" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Satırı sil"><Trash2 size={16} /></button>
                {qi && <div className="xs muted" style={{ gridColumn: '1 / -1' }}>{qi.description}: {qi.qty} × {money(qi.unit_price)} = <b>{money(qi.total)}</b> · {has(qi.has_equivalent)}</div>}
              </div>
            );
          })}
          {qErr && <div className="alert error"><AlertTriangle size={18} />{qErr.message}</div>}
          <div className="gb-total-bar">
            <div><div className="small muted">Ödenecek tutar</div><div className="v" style={{ opacity: stale ? 0.55 : 1 }}>{money(total)}</div></div>
            <div className="right"><div className="small muted">Has karşılığı</div><b className="num">{has(quote?.has_total || 0)}</b>
              {quote?.rates?.HAS?.buy && <div className="xs muted">Has alış: {money(quote.rates.HAS.buy)}</div>}</div>
          </div>
        </div>
      </Card>

      <Card title="Müşteri ve ödeme">
        <div className="stack" style={{ gap: 12 }}>
          <FieldBox label="Müşteri" hint="yüksek tutarda TC zorunlu"><CustomerPicker value={customer} onChange={setCustomer} /></FieldBox>
          <div className="row" style={{ gap: 6 }}>
            {PAY_OPTS.map(([m, l]) => <button key={m} type="button" className="btn sm" onClick={() => addPay(m)}><Plus size={14} />{l}</button>)}
          </div>
          {pays.map((p) => (
            <div className="gb-pay" key={p.key}>
              <div className="gb-pay-head"><b className="small">{PAY_OPTS.find((x) => x[0] === p.method)[1]}</b>
                <button type="button" className="btn ghost icon sm" onClick={() => setPays((ps) => ps.filter((x) => x.key !== p.key))} aria-label="Ödemeyi sil"><Trash2 size={15} /></button></div>
              <div className="gb-pay-grid">
                {p.method === 'doviz' && <Select label="Cins" value={p.currency} onChange={(e) => setPay(p.key, 'currency', e.target.value)} options={[['USD', 'USD $'], ['EUR', 'EUR €'], ['GBP', 'GBP £']]} />}
                {p.method === 'cari' && <Select label="Birim" value={p.currency} onChange={(e) => setPay(p.key, 'currency', e.target.value)} options={[['TRY', 'TL'], ['HAS', 'Gram has']]} />}
                <Input label={p.method === 'doviz' ? 'Tutar' : p.currency === 'HAS' ? 'Gram has' : 'Tutar (₺)'} inputMode="decimal" value={p.amount} onChange={(e) => setPay(p.key, 'amount', e.target.value)} />
              </div>
              {p.method === 'doviz' && toNum(p.amount) > 0 && rateOf(p) && <div className="xs muted">≈ {money(toNum(p.amount) * rateOf(p))} (satış kuru {money(rateOf(p))})</div>}
              {p.method === 'cari' && <div className="xs muted">Tutar müşterinin hesabına alacak olarak yazılır.</div>}
            </div>
          ))}
          {total > 0 && (Math.abs(remaining) > 0.009 ? (
            <div className={`gb-remaining ${remaining > 0 ? 'due' : 'change'}`}>
              <span>{remaining > 0 ? `Ödenecek kalan: ${money(remaining)}` : `Fazla ödeme: ${money(-remaining)}`}</span>
              {remaining > 0 && <button type="button" className="btn sm" onClick={addRemainingCash}><Banknote size={15} />Kalanı nakit öde</button>}
            </div>
          ) : <div className="gb-remaining ok"><span>Ödeme dengede</span><CheckCircle2 size={18} /></div>)}
          {needsCustomer && <div className="alert warn"><AlertTriangle size={18} />Cariye yazmak için müşteri seçin.</div>}
          <Input label="Not" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="İsteğe bağlı" />
          <ErrorBox error={err} />
          <button type="button" className="btn primary lg block" onClick={submit}
            disabled={busy || stale || !quote || !!qErr || Math.abs(remaining) > 1 || needsCustomer}>
            <CheckCircle2 size={20} />{busy ? 'Kaydediliyor…' : 'Alışı kaydet'}
          </button>
          {done && <div className="alert ok"><CheckCircle2 size={18} />Son kayıt: <b>{done.no}</b> — {money(done.total)} · {has(done.has_total)}</div>}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toptancıdan ürün alımı                                              */
/* ------------------------------------------------------------------ */
function SupplierPurchase({ onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: suppliers } = useApi(A('/suppliers'));
  const { data: products } = useApi(A('/products'));
  const [supplierId, setSupplierId] = useState('');
  const [rows, setRows] = useState([urunRow()]);
  const [filter, setFilter] = useState('');
  const [settleHas, setSettleHas] = useState('cari');
  const [settleTl, setSettleTl] = useState('cari');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState(null);
  const [qErr, setQErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => Object.fromEntries((products || []).map((p) => [p.id, p])), [products]);
  const shown = useMemo(() => {
    const f = filter.trim().toLocaleLowerCase('tr');
    return (products || []).filter((p) => !f || p.name.toLocaleLowerCase('tr').includes(f) || p.sku?.toLocaleLowerCase('tr').includes(f) || p.barcode === filter.trim()).slice(0, 300);
  }, [products, filter]);

  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => {
    if (r.key !== key) return r;
    if (k === 'product_id') {
      // Ürün seçilince son maliyeti öner
      const p = byId[v];
      return { ...r, product_id: v, unit_has: p ? String(p.cost_has ?? '') : '', unit_tl: p ? String(p.cost_tl ?? '') : '' };
    }
    return { ...r, [k]: v };
  }));

  const items = rows.map((r) => (r.product_id && parseInt(r.qty, 10) > 0
    ? { product_id: Number(r.product_id), qty: parseInt(r.qty, 10), unit_has: toNum(r.unit_has) ?? 0, unit_tl: toNum(r.unit_tl) ?? 0 } : null)).filter(Boolean);
  const dKey = useDebounced(JSON.stringify(items), 350);
  const stale = dKey !== JSON.stringify(items);
  useEffect(() => {
    const its = JSON.parse(dKey);
    if (!its.length) { setQuote(null); setQErr(null); return; }
    let alive = true;
    api.post(A('/purchases/quote'), { kind: 'urun', items: its })
      .then((q) => { if (alive) { setQuote(q); setQErr(null); } })
      .catch((e) => alive && setQErr(e));
    return () => { alive = false; };
  }, [dKey]);

  const hasTotal = items.reduce((s, i) => s + i.unit_has * i.qty, 0);
  const tlTotal = items.reduce((s, i) => s + i.unit_tl * i.qty, 0);
  const supplier = (suppliers || []).find((s) => String(s.id) === supplierId);

  const submit = async () => {
    const ok = await confirm(`${supplier?.name} tedarikçisinden ${items.reduce((s, i) => s + i.qty, 0)} adet ürün alımı kaydedilsin mi? Stoklar artırılacak.`, { ok: 'Kaydet' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.post(A('/purchases'), { kind: 'urun', supplier_id: Number(supplierId), items, settle_has: settleHas, settle_tl: settleTl, note: note.trim() || null });
      toast(`Alış kaydedildi: ${res.no} — stoklar güncellendi`);
      setRows([urunRow()]); setNote(''); setQuote(null);
      onDone();
    } catch (e) { toast(e); } finally { setBusy(false); }
  };

  if (!suppliers || !products) return <Loading />;
  return (
    <div className="grid c2" style={{ alignItems: 'start' }}>
      <Card title="Alınan ürünler" actions={<button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, urunRow()])}><Plus size={15} />Satır</button>}>
        <div className="stack" style={{ gap: 10 }}>
          <Input label="Ürün listesini süz" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Ad, stok kodu veya barkod" />
          {rows.map((r) => {
            const p = byId[r.product_id];
            return (
              <div className="gb-line" key={r.key}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Select label="Ürün" value={r.product_id} onChange={(e) => setRow(r.key, 'product_id', e.target.value)}>
                    <option value="">— Ürün seçin —</option>
                    {p && !shown.includes(p) && <option value={p.id}>{p.name}</option>}
                    {shown.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.sku}{x.karat ? ` · ${x.karat}A` : ''} (stok {x.stock_qty})</option>)}
                  </Select>
                </div>
                <Input label="Adet" inputMode="numeric" value={r.qty} onChange={(e) => setRow(r.key, 'qty', e.target.value.replace(/\D/g, ''))} />
                <Input label="Birim has (gr)" inputMode="decimal" value={r.unit_has} onChange={(e) => setRow(r.key, 'unit_has', e.target.value)} />
                <Input label="Birim TL" hint="işçilik/taş" inputMode="decimal" value={r.unit_tl} onChange={(e) => setRow(r.key, 'unit_tl', e.target.value)} />
                <button type="button" className="btn ghost icon" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Satırı sil"><Trash2 size={16} /></button>
                {p && <div className="xs muted" style={{ gridColumn: '1 / -1' }}>{p.karat ? `${p.karat} ayar · ` : ''}{gram(p.gram)} · mevcut stok {p.stock_qty} · son maliyet {has(p.cost_has)}{p.cost_tl ? ` + ${money(p.cost_tl)}` : ''}</div>}
              </div>
            );
          })}
          {qErr && <div className="alert error"><AlertTriangle size={18} />{qErr.message}</div>}
          <div className="gb-total-bar">
            <div><div className="small muted">Has borcu</div><div className="v">{has(Math.round(hasTotal * 1000) / 1000)}</div></div>
            <div className="right"><div className="small muted">TL borcu</div><b className="num">{money(tlTotal)}</b>
              {quote && <div className="xs muted" style={{ opacity: stale ? 0.55 : 1 }}>Toplam değer ≈ {money(quote.total)}</div>}</div>
          </div>
        </div>
      </Card>

      <Card title="Tedarikçi ve ödeme">
        <div className="stack" style={{ gap: 12 }}>
          <Select label="Tedarikçi (toptancı)" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Seçin —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {supplier && (
            <div className="small muted">Mevcut bakiye: <b>{has(supplier.balance_has)}</b> · <b>{money(supplier.balance_try)}</b></div>
          )}
          <FieldBox label="Has borcu nasıl kapanacak?">
            <Seg value={settleHas} onChange={setSettleHas} options={[['cari', 'Cariye yaz'], ['kasa', 'Kasadan has ver']]} />
          </FieldBox>
          <FieldBox label="TL borcu nasıl kapanacak?">
            <Seg value={settleTl} onChange={setSettleTl} options={[['cari', 'Cariye yaz'], ['nakit', 'Nakit öde'], ['banka', 'Bankadan öde']]} />
          </FieldBox>
          <Input label="Not" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="İrsaliye/fatura no vb." />
          <button type="button" className="btn primary lg block" disabled={busy || !supplierId || !items.length || !!qErr || stale} onClick={submit}>
            <CheckCircle2 size={20} />{busy ? 'Kaydediliyor…' : 'Alışı kaydet ve stoğa ekle'}
          </button>
          {!supplierId && <div className="xs muted center">Tedarikçi seçin.</div>}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Geçmiş alışlar                                                      */
/* ------------------------------------------------------------------ */
function History({ refresh }) {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState(null);
  const p = new URLSearchParams({ from, to });
  if (kind) p.set('kind', kind);
  const { data, loading, error } = useApi(A(`/purchases?${p}`), [refresh]);
  const sum = (data || []).filter((x) => x.status !== 'iptal').reduce((s, x) => ({ total: s.total + x.total, has: s.has + x.has_total }), { total: 0, has: 0 });

  return (
    <Card title="Geçmiş alışlar" pad={false}>
      <div className="card-body stack" style={{ gap: 10, paddingBottom: 10 }}>
        <div className="gb-filters">
          <label className="field"><span>Başlangıç</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Bitiş</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <Select label="Tür" value={kind} onChange={(e) => setKind(e.target.value)} options={[['', 'Tümü'], ['hurda', 'Hurda altın'], ['sarrafiye', 'Sarrafiye'], ['urun', 'Toptancı']]} />
        </div>
        {data && <div className="small muted">{data.length} kayıt · Toplam <b>{money(sum.total)}</b> · <b>{has(Math.round(sum.has * 1000) / 1000)}</b></div>}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !data?.length ? <Empty icon={Search}>Bu aralıkta alış yok</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>No</th><th>Tarih</th><th>Tür</th><th>Karşı taraf</th><th className="right gb-hide-sm">Has</th><th className="right">Tutar</th><th className="gb-hide-md">Kaydeden</th></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={x.id} className={`click ${x.status === 'iptal' ? 'gb-cancel' : ''}`} onClick={() => setOpen(x.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(x.id)}>
                  <td className="nowrap"><b>{x.no}</b></td>
                  <td className="nowrap small">{dateTime(x.ts)}</td>
                  <td><Badge tone={KIND[x.kind]?.[1]}>{KIND[x.kind]?.[0]}</Badge></td>
                  <td>{x.supplier_name || x.customer_name || <span className="muted">—</span>}</td>
                  <td className="right num nowrap gb-hide-sm">{has(x.has_total)}</td>
                  <td className="right num nowrap gb-amt"><b>{money(x.total)}</b></td>
                  <td className="gb-hide-md small">{x.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <PurchaseModal id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function PurchaseModal({ id, onClose }) {
  const { data: p, loading, error } = useApi(A(`/purchases/${id}`));
  const ACC = { kasa: 'Kasa', banka: 'Banka', pos: 'POS' };
  return (
    <Modal title={p ? `Alış ${p.no}` : 'Alış detayı'} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Kapat</button>}>
      {loading && !p ? <Loading /> : error ? <ErrorBox error={error} /> : p && (
        <div className="stack">
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Tarih</dt><dd>{dateTime(p.ts)}</dd>
            <dt>Tür</dt><dd><Badge tone={KIND[p.kind]?.[1]}>{KIND[p.kind]?.[0]}</Badge>{p.status === 'iptal' && <> <Badge tone="red">İptal</Badge></>}</dd>
            <dt>{p.kind === 'urun' ? 'Tedarikçi' : 'Müşteri'}</dt><dd>{p.supplier_name || p.customer_name || '—'}</dd>
            <dt>Kaydeden</dt><dd>{p.user_name}</dd>
            <dt>Toplam</dt><dd className="num"><b>{money(p.total)}</b> · {has(p.has_total)}</dd>
            {p.note && <><dt>Not</dt><dd>{p.note}</dd></>}
          </dl>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kalem</th><th>Ayar</th><th className="right">Gram</th><th className="right gb-hide-sm">Fire</th><th className="right">Adet</th><th className="right gb-hide-sm">Has</th><th className="right">Tutar</th></tr></thead>
              <tbody>
                {p.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.description}</td><td>{i.karat || '—'}</td>
                    <td className="right num nowrap">{gram(i.gram)}</td>
                    <td className="right gb-hide-sm">{i.fire_pct ? `%${i.fire_pct}` : '—'}</td>
                    <td className="right">{i.qty}</td>
                    <td className="right num nowrap gb-hide-sm">{has(i.has_equivalent)}</td>
                    <td className="right num nowrap"><b>{money(i.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.payments?.length > 0 && (
            <>
              <b className="small">Kasa hareketleri</b>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Açıklama</th><th>Hesap</th><th className="right">Miktar</th><th className="right">TL</th></tr></thead>
                  <tbody>
                    {p.payments.map((m) => (
                      <tr key={m.id} className={m.cancelled ? 'gb-cancel' : ''}>
                        <td>{m.direction === 'in' ? 'Giriş' : 'Çıkış'} · {m.description}</td><td>{ACC[m.account]}</td>
                        <td className="right num nowrap">{curAmount(m.amount, m.currency)}</td><td className="right num nowrap">{money(m.amount_try)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
