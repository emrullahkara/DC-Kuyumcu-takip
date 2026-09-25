import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Repeat, Lock, RefreshCw, Ban, Calculator } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api, A } from '../../lib/api.js';
import { money, has, num, curAmount, date, dateTime, today, daysAgo, price, ACCOUNT_LABEL, CUR } from '../../lib/format.js';
import { Card, Stat, Loading, Empty, ErrorBox, Badge, Modal, Field, Input, Select, Textarea, Seg, useToast, useConfirm } from '../../components/ui.jsx';
import './grupA.css';

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'HAS'];
const ACCOUNTS = ['kasa', 'banka', 'pos'];
const CUR_NAME = { TRY: 'TL', USD: 'Dolar', EUR: 'Euro', GBP: 'Sterlin', HAS: 'Has altın' };

/** Kasa hareket kategorileri (sunucunun /cash/meta listesine ek olarak sistemin kendi yazdıkları) */
export const EXPENSE_LABEL = {
  kira: 'Kira', elektrik: 'Elektrik / Su / Doğalgaz', personel: 'Personel', vergi: 'Vergi / Muhasebe', guvenlik: 'Güvenlik / Sigorta',
  kargo: 'Kargo / Ulaşım', reklam: 'Reklam', atolye: 'Atölye malzemesi', mutfak: 'Mutfak / Temizlik', banka: 'Banka / POS komisyonu', diger_gider: 'Diğer gider',
};
const SYSTEM_LABEL = {
  satis: 'Satış', takas: 'Eski altın takas', hurda: 'Hurda alım', alis: 'Alış ödemesi', tedarikci: 'Tedarikçi', tamir: 'Tamir',
  tahsilat: 'Cari tahsilat', odeme: 'Müşteriye ödeme', emanet: 'Emanet', doviz: 'Döviz bozdurma', virman: 'Virman', devir: 'Devir',
  diger_gelir: 'Diğer gelir', sermaye: 'Sermaye girişi', faiz: 'Faiz / Getiri',
};
const catLabel = (c, meta) => meta?.expense?.[c] || meta?.income?.[c] || EXPENSE_LABEL[c] || SYSTEM_LABEL[c] || c;

/** Para birimine göre sayı biçimi: HAS 3 hane, diğerleri 2 hane */
const round = (v, c) => (c === 'HAS' ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100);

export default function Cash() {
  usePageTitle('Kasa & Gelir-Gider');
  const { can } = useAuth();
  const canW = can('cash', 'w');
  const [tab, setTab] = useState('bal');
  const meta = useApi(A('/cash/meta'));
  const bal = useApi(A('/cash/balances'));

  const tabs = [['bal', 'Bakiyeler'], ['mov', 'Hareketler'], ...(canW ? [['add', 'Gider / Gelir ekle'], ['fx', 'Döviz bozdur']] : []), ['day', 'Gün sonu']];

  return (
    <div className="ga-page">
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'bal' && <Balances state={bal} canW={canW} />}
      {tab === 'mov' && <Movements meta={meta.data} canW={canW} onChange={bal.reload} />}
      {tab === 'add' && canW && <AddMovement meta={meta.data} onDone={bal.reload} />}
      {tab === 'fx' && canW && <Exchange rates={bal.data?.rates} onDone={bal.reload} />}
      {tab === 'day' && <DayClose canW={canW} onDone={bal.reload} />}
    </div>
  );
}

// ---------- Bakiyeler ----------
function Balances({ state, canW }) {
  const { data, loading, error, reload } = state;
  const [transfer, setTransfer] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const b = data.balances || {};
  const rates = data.rates || {};
  const rate = (c) => (c === 'TRY' ? 1 : rates[c]?.buy || 0);
  // GBP yalnızca hareket varsa gösterilsin
  const curs = CURRENCIES.filter((c) => c !== 'GBP' || ACCOUNTS.some((a) => b[a]?.[c]));
  const sumCur = (c) => ACCOUNTS.reduce((x, a) => x + (b[a]?.[c] || 0), 0);
  const accTry = (a) => curs.reduce((x, c) => x + (b[a]?.[c] || 0) * rate(c), 0);
  const cell = (v, c) => <span className={v < 0 ? 'neg' : ''}>{v ? curAmount(round(v, c), c) : <span className="muted">—</span>}</span>;

  return (
    <div className="stack">
      <div className="grid c4">
        <Stat tone="gold" label="Toplam varlık (TL karşılığı)" value={money(data.total_try, 0)} sub="Alış fiyatlarından hesaplanır" />
        <Stat label="Kasadaki nakit TL" value={money(b.kasa?.TRY || 0, 0)} sub="Çekmecedeki para" />
        <Stat label="Kasadaki has altın" value={has(b.kasa?.HAS || 0)} sub={rates.HAS ? `≈ ${money((b.kasa?.HAS || 0) * rates.HAS.buy, 0)}` : ''} />
        <Stat label="Döviz (kasa)" value={`${num(b.kasa?.USD || 0)} $ · ${num(b.kasa?.EUR || 0)} €`} sub={rates.USD ? `USD ${price(rates.USD.buy, 'USD')} · EUR ${price(rates.EUR?.buy, 'EUR')}` : ''} />
      </div>
      <Card title="Hesap × para birimi" pad={false} actions={<>
        <button type="button" className="btn sm ghost" onClick={reload} aria-label="Yenile"><RefreshCw size={16} /></button>
        {canW && <button type="button" className="btn sm" onClick={() => setTransfer(true)}><ArrowLeftRight size={16} /> Virman</button>}
      </>}>
        <div className="table-wrap">
          <table className="ga-bal">
            <thead><tr><th>Hesap</th>{curs.map((c) => <th key={c}>{CUR_NAME[c]}</th>)}<th>TL karşılığı</th></tr></thead>
            <tbody>
              {ACCOUNTS.map((a) => (
                <tr key={a}><td><b>{ACCOUNT_LABEL[a]}</b></td>{curs.map((c) => <td key={c}>{cell(b[a]?.[c] || 0, c)}</td>)}<td><b>{money(accTry(a), 0)}</b></td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>Toplam</td>{curs.map((c) => <td key={c}>{cell(sumCur(c), c)}</td>)}<td>{money(data.total_try, 0)}</td></tr></tfoot>
          </table>
        </div>
      </Card>
      {transfer && <TransferModal onClose={() => setTransfer(false)} onDone={() => { setTransfer(false); reload(); }} />}
    </div>
  );
}

function TransferModal({ onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ from: 'pos', to: 'banka', currency: 'TRY', amount: '', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const submit = async (e) => {
    e?.preventDefault();
    if (f.from === f.to) return toast('Kaynak ve hedef aynı olamaz', 'error');
    setBusy(true);
    try {
      await api.post(A('/cash/transfer'), { ...f, amount: Number(f.amount), description: f.description || undefined });
      toast('Virman kaydedildi');
      onDone();
    } catch (err) { toast(err); } finally { setBusy(false); }
  };
  return (
    <Modal title="Hesaplar arası virman" onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="ga-transfer" className="btn primary" disabled={busy || !(Number(f.amount) > 0)}>Aktar</button>
    </>}>
      <form id="ga-transfer" className="stack" onSubmit={submit}>
        <Field label="Nereden"><Seg value={f.from} onChange={set('from')} options={ACCOUNTS.map((a) => [a, ACCOUNT_LABEL[a]])} /></Field>
        <Field label="Nereye"><Seg value={f.to} onChange={set('to')} options={ACCOUNTS.map((a) => [a, ACCOUNT_LABEL[a]])} /></Field>
        <Field label="Para birimi"><Seg value={f.currency} onChange={set('currency')} options={CURRENCIES.map((c) => [c, CUR_NAME[c]])} /></Field>
        <Input label={`Tutar (${CUR[f.currency]})`} type="number" inputMode="decimal" min="0" step={f.currency === 'HAS' ? '0.001' : '0.01'} className="input lg" value={f.amount} onChange={set('amount')} required autoFocus />
        <Input label="Açıklama" hint="isteğe bağlı" value={f.description} onChange={set('description')} maxLength={200} placeholder="Ör. POS gün sonu bankaya geçti" />
      </form>
    </Modal>
  );
}

// ---------- Hareketler ----------
function Movements({ meta, canW, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState({ from: daysAgo(6), to: today(), account: '', currency: '', category: '', direction: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, loading, error, reload } = useApi(A(`/cash/movements?${qs}`));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const catOptions = useMemo(() => {
    const all = { ...SYSTEM_LABEL, ...EXPENSE_LABEL, ...(meta?.expense || {}), ...(meta?.income || {}) };
    return [['', 'Tümü'], ...Object.entries(all).sort((a, b) => a[1].localeCompare(b[1], 'tr'))];
  }, [meta]);

  // İptal edilmeyenlerin TL toplamları
  const totals = useMemo(() => {
    const t = { in: 0, out: 0 };
    for (const m of data || []) if (!m.cancelled) t[m.direction] += m.amount_try || 0;
    return t;
  }, [data]);

  const cancel = async (m) => {
    const ok = await confirm(`${dateTime(m.ts)} tarihli ${curAmount(m.amount, m.currency)} tutarındaki "${catLabel(m.category, meta)}" kaydı iptal edilsin mi? Kayıt silinmez, üstü çizili kalır.`, { danger: true, ok: 'İptal et', title: 'Hareketi iptal et' });
    if (!ok) return;
    try { await api.post(A(`/cash/movements/${m.id}/cancel`)); toast('Hareket iptal edildi'); reload(); onChange?.(); } catch (err) { toast(err); }
  };

  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="ga-filter">
          <Input label="Başlangıç" type="date" value={f.from} onChange={set('from')} max={f.to} />
          <Input label="Bitiş" type="date" value={f.to} onChange={set('to')} min={f.from} />
          <Select label="Hesap" value={f.account} onChange={set('account')} options={[['', 'Tümü'], ...ACCOUNTS.map((a) => [a, ACCOUNT_LABEL[a]])]} />
          <Select label="Para birimi" value={f.currency} onChange={set('currency')} options={[['', 'Tümü'], ...CURRENCIES.map((c) => [c, CUR_NAME[c]])]} />
          <Select label="Kategori" value={f.category} onChange={set('category')} options={catOptions} />
          <Select label="Yön" value={f.direction} onChange={set('direction')} options={[['', 'Tümü'], ['in', 'Giriş'], ['out', 'Çıkış']]} />
        </div>
      </div>
      <div className="grid c3">
        <Stat label="Giriş (TL karşılığı)" value={<span className="up">{money(totals.in, 0)}</span>} />
        <Stat label="Çıkış (TL karşılığı)" value={<span className="down">{money(totals.out, 0)}</span>} />
        <Stat label="Net" value={money(totals.in - totals.out, 0)} sub={`${data?.length ?? 0} hareket${data?.length >= 1000 ? ' (ilk 1000)' : ''}`} />
      </div>
      <ErrorBox error={error} />
      <Card pad={false}>
        {loading && !data ? <Loading /> : !data?.length ? <Empty>Bu filtrede hareket yok</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>Tarih</th><th className="ga-hide-sm">Hesap</th><th>Kategori / Açıklama</th><th className="right">Tutar</th>
                <th className="right ga-hide-md">TL karşılığı</th><th className="ga-hide-md">Kullanıcı</th>{canW && <th />}
              </tr></thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className={m.cancelled ? 'ga-cancelled' : ''}>
                    <td className="nowrap small">{dateTime(m.ts)}</td>
                    <td className="ga-hide-sm">{ACCOUNT_LABEL[m.account] || m.account}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <b className="small">{catLabel(m.category, meta)}</b>
                        {m.cancelled ? <Badge tone="red">İptal</Badge> : null}
                      </div>
                      {m.description && <div className="muted xs">{m.description}</div>}
                    </td>
                    <td className={`right num nowrap ${m.direction === 'in' ? 'up' : 'down'}`}>
                      {m.direction === 'in' ? '+' : '−'}{curAmount(m.amount, m.currency)}
                    </td>
                    <td className="right num ga-hide-md">{money(m.amount_try)}</td>
                    <td className="ga-hide-md small">{m.user_name || '—'}</td>
                    {canW && (
                      <td className="act right">
                        {m.ref_type === 'manual' && !m.cancelled && (
                          <button type="button" className="btn sm danger" onClick={() => cancel(m)} title="Hatalı kaydı iptal et"><Ban size={14} /> İptal</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Gider / Gelir ekle ----------
function AddMovement({ meta, onDone }) {
  const toast = useToast();
  const empty = { direction: 'out', account: 'kasa', currency: 'TRY', amount: '', category: '', description: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const recent = useApi(A(`/cash/movements?from=${today()}&to=${today()}`));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));

  const cats = f.direction === 'out' ? meta?.expense : { ...(meta?.income || {}), devir: 'Devir (açılış bakiyesi)' };
  // Yön değişince uygun ilk kategoriyi seç
  useEffect(() => { if (cats && !cats[f.category]) setF((s) => ({ ...s, category: Object.keys(cats)[0] || '' })); }, [f.direction, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(A('/cash/movements'), { ...f, amount: Number(f.amount), description: f.description || undefined });
      toast(f.direction === 'out' ? 'Gider kaydedildi' : 'Gelir kaydedildi');
      setF((s) => ({ ...empty, direction: s.direction, category: s.category }));
      recent.reload();
      onDone?.();
    } catch (err) { toast(err); } finally { setBusy(false); }
  };
  const manual = (recent.data || []).filter((m) => m.ref_type === 'manual');

  return (
    <div className="grid c2" style={{ alignItems: 'start' }}>
      <Card title={f.direction === 'out' ? 'Gider kaydı' : 'Gelir kaydı'}>
        <form className="stack" onSubmit={submit}>
          <Seg value={f.direction} onChange={set('direction')} options={[['out', '− Gider (çıkış)'], ['in', '+ Gelir (giriş)']]} />
          <Field label="Hesap"><Seg value={f.account} onChange={set('account')} options={ACCOUNTS.map((a) => [a, ACCOUNT_LABEL[a]])} /></Field>
          <Field label="Para birimi"><Seg value={f.currency} onChange={set('currency')} options={CURRENCIES.map((c) => [c, CUR_NAME[c]])} /></Field>
          <Field label="Kategori">
            <select className="select" value={f.category} onChange={set('category')} required>
              {Object.entries(cats || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Input label={`Tutar (${CUR[f.currency]})`} className="input lg" type="number" inputMode="decimal" min="0" step={f.currency === 'HAS' ? '0.001' : '0.01'} value={f.amount} onChange={set('amount')} required placeholder="0" />
          <Textarea label="Açıklama" hint="isteğe bağlı" value={f.description} onChange={set('description')} maxLength={300} rows={2} placeholder="Ör. Eylül kirası" />
          <button type="submit" className="btn primary lg" disabled={busy || !(Number(f.amount) > 0) || !f.category}>
            {f.direction === 'out' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />} Kaydet
          </button>
        </form>
      </Card>
      <Card title="Bugünkü elle girilen kayıtlar" pad={false}>
        {recent.loading && !recent.data ? <Loading /> : !manual.length ? <Empty>Bugün elle kayıt yok</Empty> : (
          <ul className="ga-list">
            {manual.map((m) => (
              <li key={m.id} className={m.cancelled ? 'muted' : ''} style={m.cancelled ? { textDecoration: 'line-through' } : undefined}>
                <div className="grow"><b className="small">{catLabel(m.category, meta)}</b><div className="muted xs">{ACCOUNT_LABEL[m.account]} · {m.description || '—'}</div></div>
                <span className={`num nowrap ${m.direction === 'in' ? 'up' : 'down'}`}>{m.direction === 'in' ? '+' : '−'}{curAmount(m.amount, m.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------- Döviz bozdurma ----------
function Exchange({ rates, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ side: 'buy', currency: 'USD', amount: '', rate: '' });
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const boardRate = rates?.[f.currency]?.[f.side === 'buy' ? 'buy' : 'sell'];
  const effRate = Number(f.rate) > 0 ? Number(f.rate) : boardRate;
  const estimate = Number(f.amount) > 0 && effRate ? Number(f.amount) * effRate : null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(A('/cash/exchange'), { side: f.side, currency: f.currency, amount: Number(f.amount), rate: Number(f.rate) > 0 ? Number(f.rate) : undefined });
      setLast({ ...f, ...r });
      toast(`${f.side === 'buy' ? 'Döviz alındı' : 'Döviz satıldı'}: ${money(r.tl)}`);
      setF((s) => ({ ...s, amount: '', rate: '' }));
      onDone?.();
    } catch (err) { toast(err); } finally { setBusy(false); }
  };

  return (
    <div className="grid c2" style={{ alignItems: 'start' }}>
      <Card title="Döviz bozdur">
        <form className="stack" onSubmit={submit}>
          <Seg value={f.side} onChange={set('side')} options={[['buy', 'Müşteriden AL (TL öde)'], ['sell', 'Müşteriye SAT (TL al)']]} />
          <Field label="Döviz"><Seg value={f.currency} onChange={set('currency')} options={[['USD', '$ Dolar'], ['EUR', '€ Euro'], ['GBP', '£ Sterlin']]} /></Field>
          <Input label={`Miktar (${CUR[f.currency]})`} className="input lg" type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={set('amount')} required placeholder="0" />
          <Input label="Kur" hint={boardRate ? `boş bırakılırsa pano kuru: ${price(boardRate, f.currency)}` : 'boş bırakılırsa pano kuru'} type="number" inputMode="decimal" min="0" step="0.0001" value={f.rate} onChange={set('rate')} placeholder={boardRate ? String(boardRate) : ''} />
          <div className="alert info" style={{ alignItems: 'center' }}>
            <Calculator size={18} />
            <div className="grow">{f.side === 'buy' ? 'Müşteriye ödenecek' : 'Müşteriden alınacak'} (tahmini)</div>
            <span className="ga-amount-big">{estimate ? money(estimate) : '—'}</span>
          </div>
          <button type="submit" className="btn primary lg" disabled={busy || !(Number(f.amount) > 0)}><Repeat size={18} /> İşlemi kaydet</button>
          <p className="muted xs" style={{ margin: 0 }}>İşlem kasaya iki hareket olarak yazılır: döviz {f.side === 'buy' ? 'girişi + TL çıkışı' : 'çıkışı + TL girişi'}.</p>
        </form>
      </Card>
      <div className="stack">
        <Card title="Pano kurları">
          <table className="ga-bal">
            <thead><tr><th>Döviz</th><th>Alış</th><th>Satış</th></tr></thead>
            <tbody>{['USD', 'EUR', 'GBP'].map((c) => (
              <tr key={c}><td><b>{CUR_NAME[c]}</b></td><td>{price(rates?.[c]?.buy, c)}</td><td>{price(rates?.[c]?.sell, c)}</td></tr>
            ))}</tbody>
          </table>
        </Card>
        {last && (
          <div className="alert ok">
            <div>
              <b>Son işlem kaydedildi</b>
              <div className="small">{last.side === 'buy' ? 'Alınan' : 'Satılan'}: {num(last.amount)} {CUR[last.currency]} @ {price(last.rate, last.currency)} = <b>{money(last.tl)}</b></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Gün sonu ----------
function DayClose({ canW, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState(today());
  const day = useApi(A(`/cash/day?date=${d}`));
  const closings = useApi(A('/cash/closings'));
  const [counted, setCounted] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCounted({}); setNote(''); }, [d]);

  const expected = day.data?.balances?.kasa || {};
  const closing = day.data?.closing;
  const curs = CURRENCIES.filter((c) => c !== 'GBP' || expected.GBP);
  const diffOf = (c) => (counted[c] === '' || counted[c] === undefined ? null : round(Number(counted[c]) - (expected[c] || 0), c));

  // Günün kasa hareketleri: kategori bazında giriş/çıkış
  const summary = useMemo(() => {
    const m = {};
    for (const r of day.data?.rows || []) {
      if (r.account !== 'kasa') continue;
      const k = `${r.category}|${r.currency}`;
      m[k] ??= { category: r.category, currency: r.currency, in: 0, out: 0, n: 0 };
      m[k][r.direction] += r.total; m[k].n += r.n;
    }
    return Object.values(m).sort((a, b) => a.category.localeCompare(b.category));
  }, [day.data]);

  const submit = async () => {
    const c = Object.fromEntries(Object.entries(counted).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [k, Number(v)]));
    if (!Object.keys(c).length) return toast('En az bir sayım girin', 'error');
    const missing = curs.filter((k) => expected[k] && c[k] === undefined);
    const ok = await confirm(`${date(d)} günü kasası kapatılsın mı? Kapanış sonradan değiştirilemez.${missing.length ? ` Girilmeyen: ${missing.map((k) => CUR_NAME[k]).join(', ')} (0 kabul edilir).` : ''}`, { ok: 'Günü kapat', title: 'Gün sonu' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(A('/cash/day-close'), { date: d, counted: c, note: note || undefined });
      toast('Gün sonu kaydedildi');
      day.reload(); closings.reload(); onDone?.();
    } catch (err) { toast(err); } finally { setBusy(false); }
  };

  const diffCell = (v, c) => (v === null || v === undefined ? <span className="muted">—</span>
    : <span className={v > 0 ? 'ga-diff-pos' : v < 0 ? 'ga-diff-neg' : 'ga-diff-zero'}>{v > 0 ? '+' : ''}{curAmount(v, c)}</span>);

  return (
    <div className="stack">
      <div className="row">
        <Field label="Gün"><input className="input" type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
        {closing ? <Badge tone="green"><Lock size={12} /> Kapatıldı</Badge> : <Badge tone="amber">Açık</Badge>}
      </div>
      <ErrorBox error={day.error} />
      {day.loading && !day.data ? <Loading /> : day.data && (
        <div className="grid c2" style={{ alignItems: 'start' }}>
          <Card title={closing ? `Kapanış — ${date(d)}` : 'Kasa sayımı'} pad={false}>
            {d !== today() && !closing && <div className="alert warn" style={{ margin: 12 }}>Beklenen tutarlar kasanın <b>şu anki</b> bakiyesidir; geçmiş gün kapatırken dikkat edin.</div>}
            <div className="table-wrap">
              <table className="ga-bal">
                <thead><tr><th>Birim</th><th>Beklenen</th><th>Sayılan</th><th>Fark</th></tr></thead>
                <tbody>
                  {(closing ? CURRENCIES.filter((c) => c in closing.expected || c in closing.counted) : curs).map((c) => (
                    <tr key={c}>
                      <td><b>{CUR_NAME[c]}</b></td>
                      <td>{curAmount((closing ? closing.expected[c] : expected[c]) || 0, c)}</td>
                      <td style={{ minWidth: 120 }}>
                        {closing ? curAmount(closing.counted[c] ?? 0, c) : (
                          <input className="input" style={{ textAlign: 'right' }} type="number" inputMode="decimal" min="0" step={c === 'HAS' ? '0.001' : '0.01'}
                            aria-label={`${CUR_NAME[c]} sayılan`} disabled={!canW} value={counted[c] ?? ''} placeholder="0"
                            onChange={(e) => setCounted((s) => ({ ...s, [c]: e.target.value }))} />
                        )}
                      </td>
                      <td>{diffCell(closing ? closing.diff[c] : diffOf(c), c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-body stack">
              {closing ? (
                <div className="small muted">{closing.note ? <>Not: {closing.note} · </> : null}Kapatan: {closing.user_name || closings.data?.find((x) => x.date === closing.date)?.user_name || '—'} · {dateTime(closing.ts)}</div>
              ) : canW ? (
                <>
                  <Textarea label="Not" hint="isteğe bağlı" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ör. 50 TL eksik, bozuk para farkı" />
                  <button type="button" className="btn primary lg" onClick={submit} disabled={busy}><Lock size={18} /> Günü kapat</button>
                </>
              ) : <div className="muted small">Gün sonu kapatma yetkiniz yok.</div>}
            </div>
          </Card>
          <Card title={`Kasa hareket özeti — ${date(d)}`} pad={false}>
            {!summary.length ? <Empty>Bu gün kasada hareket yok</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Kategori</th><th className="right">Giriş</th><th className="right">Çıkış</th></tr></thead>
                <tbody>{summary.map((r) => (
                  <tr key={`${r.category}${r.currency}`}>
                    <td>{catLabel(r.category, null)} {r.currency !== 'TRY' && <Badge>{r.currency}</Badge>} <span className="muted xs">({r.n})</span></td>
                    <td className="right num up nowrap">{r.in ? curAmount(round(r.in, r.currency), r.currency) : '—'}</td>
                    <td className="right num down nowrap">{r.out ? curAmount(round(r.out, r.currency), r.currency) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}
      <Card title="Kapanmış günler" pad={false}>
        {closings.loading && !closings.data ? <Loading /> : !closings.data?.length ? <Empty>Henüz gün sonu yapılmadı</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Tarih</th><th>Fark</th><th className="ga-hide-sm">Kapatan</th><th className="ga-hide-md">Not</th></tr></thead>
            <tbody>{closings.data.map((c) => {
              const diffs = Object.entries(c.diff).filter(([, v]) => v);
              return (
                <tr key={c.id} className="click" onClick={() => setD(c.date)} title="Ayrıntıyı göster">
                  <td className="nowrap"><b>{date(c.date)}</b></td>
                  <td>{diffs.length ? <div className="row" style={{ gap: 6 }}>{diffs.map(([k, v]) => <span key={k}>{diffCell(v, k)}</span>)}</div> : <Badge tone="green">Tam</Badge>}</td>
                  <td className="ga-hide-sm small">{c.user_name || '—'}</td>
                  <td className="ga-hide-md small muted">{c.note || ''}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
