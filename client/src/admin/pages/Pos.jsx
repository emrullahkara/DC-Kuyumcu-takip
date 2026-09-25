import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Minus, Trash2, UserPlus, X, Gem, ShoppingCart, Banknote, CreditCard, Landmark, DollarSign, Coins, NotebookPen,
  AlertTriangle, CheckCircle2, Receipt, PenLine, ScanBarcode,
} from 'lucide-react';
import { api, A } from '../../lib/api.js';
import { money, gram, has, KARATS, METHOD_LABEL, curAmount } from '../../lib/format.js';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { Modal, useToast, Input, Select, Check, Loading, Empty, Badge } from '../../components/ui.jsx';
import './grupB.css';

/* ------------------------------------------------------------------ */
/* Ortak yardımcılar (Alış ve Tamir sayfaları da kullanır)             */
/* ------------------------------------------------------------------ */

/** Değeri gecikmeli döndürür (arama/teklif isteklerini seyreltmek için) */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Sayı alanı: boş/virgüllü girişleri güvenle sayıya çevirir */
export const toNum = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

let keySeq = 0;
export const newKey = () => `k${++keySeq}`;

/**
 * Etiketli alan kutusu (label yerine div). İçinde düğme bulunan bileşenler (müşteri seçici gibi)
 * <label> içine konursa tıklama etikete aktarılıp istenmeyen düğmeyi tetikleyebilir.
 */
export function FieldBox({ label, hint, children }) {
  return (
    <div className="field">
      {label && <span>{label}{hint && <span className="hint"> — {hint}</span>}</span>}
      {children}
    </div>
  );
}

/** Hızlı müşteri ekleme penceresi (KVKK onayı zorunlu) */
export function QuickCustomerModal({ initialName = '', onClose, onCreated }) {
  const toast = useToast();
  const [f, setF] = useState({ full_name: initialName, phone: '', tckn: '', kvkk_consent: false });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async (e) => {
    e?.preventDefault();
    if (!f.kvkk_consent) { toast('Müşteri kaydı için KVKK aydınlatma onayı alınmalıdır', 'error'); return; }
    setBusy(true);
    try {
      const body = { full_name: f.full_name.trim(), phone: f.phone.trim() || null, tckn: f.tckn.trim() || null, kvkk_consent: true };
      const { id } = await api.post(A('/customers'), body);
      toast('Müşteri kaydedildi');
      // Listeden yeniden okumadan seçiciye aktar (TC yalnızca maskeli bilgi olarak tutulur)
      onCreated({ id, full_name: body.full_name, phone: body.phone, tckn_masked: body.tckn ? `${body.tckn.slice(0, 3)}******${body.tckn.slice(-2)}` : null });
    } catch (err) { toast(err); } finally { setBusy(false); }
  };
  return (
    <Modal title="Hızlı müşteri ekle" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" onClick={save} disabled={busy || f.full_name.trim().length < 2 || !f.kvkk_consent}>Kaydet ve seç</button>
    </>}>
      <form className="stack" onSubmit={save}>
        <Input label="Ad soyad" value={f.full_name} onChange={set('full_name')} autoFocus required />
        <Input label="Telefon" type="tel" inputMode="tel" placeholder="05xx xxx xx xx" value={f.phone} onChange={set('phone')} />
        <Input label="TC kimlik no" hint="yüksek tutarlı işlemlerde zorunlu" inputMode="numeric" maxLength={11} value={f.tckn}
          onChange={(e) => setF((s) => ({ ...s, tckn: e.target.value.replace(/\D/g, '') }))} />
        <Check checked={f.kvkk_consent} onChange={set('kvkk_consent')}
          label="Müşteriye KVKK aydınlatma metni okundu, kişisel verilerin işlenmesine onay alındı." />
      </form>
    </Modal>
  );
}

/**
 * Müşteri seçici: ad/telefon/TC ile arar, seçileni çip olarak gösterir.
 * value: { id, full_name, phone, tckn_masked } | null
 */
export function CustomerPicker({ value, onChange, placeholder = 'Müşteri ara: ad, telefon veya TC' }) {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q.trim(), 300);

  useEffect(() => {
    if (!dq || dq.length < 2) { setList(null); return; }
    let alive = true;
    api.get(A(`/customers?q=${encodeURIComponent(dq)}`)).then((rows) => alive && setList(rows.slice(0, 20))).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [dq]);

  const pick = (c) => { onChange(c); setQ(''); setList(null); setOpen(false); };

  if (value) {
    return (
      <div className="gb-chip">
        <div className="grow">
          <b>{value.full_name}</b>
          <span className="xs muted">{value.phone || 'Telefon yok'}</span>
        </div>
        {value.tckn_masked ? <Badge tone="green">TC kayıtlı</Badge> : <Badge tone="amber">TC yok</Badge>}
        <button type="button" className="btn ghost icon sm" onClick={() => onChange(null)} aria-label="Müşteriyi kaldır"><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="gb-cust">
      <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
        <input className="input" value={q} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 180)} aria-label="Müşteri ara" />
        {can('customers', 'w') && (
          <button type="button" className="btn icon" title="Yeni müşteri" aria-label="Yeni müşteri" onClick={() => setAdding(true)}><UserPlus size={18} /></button>
        )}
      </div>
      {open && list && (
        <div className="gb-cust-list">
          {list.length === 0 && <div className="small muted" style={{ padding: 12 }}>Eşleşen müşteri yok{can('customers', 'w') ? ' — sağdaki düğmeyle ekleyin.' : '.'}</div>}
          {list.map((c) => (
            <button type="button" key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <span><b>{c.full_name}</b><br /><span className="xs muted">{c.phone || '—'}{c.tckn_masked ? ` · TC ${c.tckn_masked}` : ''}</span></span>
              {(Math.abs(c.balance_try) > 0.009 || Math.abs(c.balance_has) > 0.0009) && (
                <span className="xs right">{c.balance_try ? money(c.balance_try) : ''}{c.balance_has ? <><br />{has(c.balance_has)}</> : ''}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {adding && <QuickCustomerModal initialName={/\d/.test(q) ? '' : q} onClose={() => setAdding(false)} onCreated={(c) => { setAdding(false); pick(c); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hızlı Satış (POS)                                                   */
/* ------------------------------------------------------------------ */

const PAY_METHODS = [
  ['nakit', 'Nakit', Banknote], ['kart', 'Kart', CreditCard], ['havale', 'Havale', Landmark],
  ['doviz', 'Döviz', DollarSign], ['altin', 'Eski altın', Coins], ['veresiye', 'Veresiye', NotebookPen],
];

const emptyPayment = (method, amount) => ({
  key: newKey(), method, currency: method === 'doviz' ? 'USD' : 'TRY', amount: amount ? String(amount) : '', karat: '22', gram: '', fire_pct: '',
});

/** Sepet satırını sunucunun beklediği kaleme çevirir */
const toItem = (l) => (l.product_id
  ? { product_id: l.product_id, qty: l.qty, unit_price: l.unit_price ?? undefined }
  : { description: l.description, qty: l.qty, karat: l.karat || null, gram: toNum(l.gram), unit_price: l.unit_price });

/** Ödeme satırını sunucu şemasına çevirir; eksik satırlar (tutarsız) atlanır */
function toPayment(p) {
  if (p.method === 'altin') {
    const g = toNum(p.gram);
    return g > 0 && p.karat ? { method: 'altin', karat: p.karat, gram: g, fire_pct: toNum(p.fire_pct) ?? 0 } : null;
  }
  const amount = toNum(p.amount);
  if (!(amount > 0)) return null;
  if (p.method === 'doviz') return { method: 'doviz', currency: p.currency, amount };
  if (p.method === 'veresiye') return { method: 'veresiye', currency: p.currency === 'HAS' ? 'HAS' : 'TRY', amount };
  return { method: p.method, currency: 'TRY', amount };
}

export default function Pos() {
  usePageTitle('Hızlı Satış');
  const { can, user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const searchRef = useRef(null);

  // Ürün listesi ve filtreler
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState(null);
  const dSearch = useDebounced(search.trim(), 300);

  // Sepet ve satış bilgileri
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState(user?.staff_id ? String(user.staff_id) : '');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [payments, setPayments] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [editLine, setEditLine] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    api.get(A('/products/categories')).then((c) => setCats(c.filter((x) => x.count > 0))).catch(() => {});
    if (can('staff')) api.get(A('/staff')).then((s) => setStaff(s.filter((x) => x.active))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ürünleri arama/kategoriye göre getir
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams();
    if (dSearch) p.set('q', dSearch);
    if (cat) p.set('category_id', cat);
    api.get(A(`/products?${p}`)).then((rows) => alive && setProducts(rows.slice(0, 120))).catch((e) => { if (alive) { setProducts([]); toast(e); } });
    return () => { alive = false; };
  }, [dSearch, cat, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sepet işlemleri ----
  const addProduct = useCallback((p) => {
    if (p.price === null || p.price === undefined) { toast(`${p.name} için güncel fiyat yok`, 'error'); return; }
    setCart((c) => {
      const ex = c.find((l) => l.product_id === p.id);
      const inCart = ex ? ex.qty : 0;
      if (inCart + 1 > p.stock_qty) { toast(`Yetersiz stok: ${p.name} (stok: ${p.stock_qty})`, 'error'); return c; }
      if (ex) return c.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: newKey(), product_id: p.id, name: p.name, karat: p.karat, gram: p.gram, image: p.image, stock: p.stock_qty, list_price: p.price, qty: 1, unit_price: null }];
    });
  }, [toast]);

  const setQty = (key, d) => setCart((c) => c.flatMap((l) => {
    if (l.key !== key) return [l];
    const qty = l.qty + d;
    if (qty <= 0) return [];
    if (l.product_id && qty > l.stock) { toast(`Stokta yalnızca ${l.stock} adet var`, 'error'); return [l]; }
    return [{ ...l, qty }];
  }));
  const removeLine = (key) => setCart((c) => c.filter((l) => l.key !== key));

  // Barkod okuyucu: klavye gibi yazar ve Enter gönderir
  const onSearchKey = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = search.trim();
    if (!code) return;
    try {
      const p = await api.get(A(`/products/lookup/${encodeURIComponent(code)}`));
      addProduct(p);
      setSearch('');
    } catch (err) {
      // Barkod değilse ad araması olarak kalır; tek sonuç varsa onu ekle
      if (err.status === 404) {
        if (products?.length === 1 && dSearch === code) { addProduct(products[0]); setSearch(''); } else toast('Barkod/stok kodu bulunamadı — ada göre arandı', 'error');
      } else toast(err);
    }
  };

  // ---- Ödeme satırları ----
  const addPayment = (method, amount) => setPayments((ps) => [...ps, emptyPayment(method, amount)]);
  // Birim (TL/has, döviz cinsi) değişince eski tutar anlamını yitirir → sıfırlanır
  const setPay = (key, k, v) => setPayments((ps) => ps.map((p) => (p.key === key ? { ...p, [k]: v, ...(k === 'currency' ? { amount: '' } : {}) } : p)));
  const removePay = (key) => setPayments((ps) => ps.filter((p) => p.key !== key));

  // ---- Sunucudan teklif (toplamlar) ----
  const body = useMemo(() => ({
    customer_id: customer?.id ?? null,
    staff_id: staffId ? Number(staffId) : null,
    items: cart.map(toItem),
    discount: toNum(discount) ?? 0,
    payments: payments.map(toPayment).filter(Boolean),
    note: note.trim() || null,
  }), [cart, customer, staffId, discount, payments, note]);
  // Her ödeme satırının teklif yanıtındaki sırası (eksik satırlar gönderilmez)
  const payIdx = useMemo(() => {
    const m = {};
    let i = 0;
    payments.forEach((p) => { if (toPayment(p)) { m[p.key] = i; i += 1; } });
    return m;
  }, [payments]);
  const quoteKey = JSON.stringify({ ...body, note: null });
  const dQuoteKey = useDebounced(quoteKey, 350);

  useEffect(() => {
    if (!cart.length) { setQuote(null); setQuoteErr(null); return; }
    let alive = true;
    setQuoting(true);
    api.post(A('/sales/quote'), JSON.parse(dQuoteKey))
      .then((qd) => { if (alive) { setQuote(qd); setQuoteErr(null); } })
      .catch((e) => { if (alive) setQuoteErr(e); })
      .finally(() => alive && setQuoting(false));
    return () => { alive = false; };
  }, [dQuoteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const stale = quoteKey !== dQuoteKey || quoting;
  const remaining = quote ? quote.remaining : 0;
  const change = remaining < -0.009 ? -remaining : 0;
  const cashPaid = body.payments.filter((p) => p.method === 'nakit').reduce((s, p) => s + p.amount, 0);
  const hasCredit = body.payments.some((p) => p.method === 'veresiye');
  const identityMissing = quote?.identity_required && !customer?.tckn_masked;
  const lineOf = (i) => quote?.lines?.[i];
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  /** Kalan tutarı nakit satırına ekler (varsa mevcut nakit satırını artırır) */
  const addRemainingCash = () => {
    if (!(remaining > 0)) return;
    const ex = payments.find((p) => p.method === 'nakit');
    if (ex) setPay(ex.key, 'amount', String(Math.round(((toNum(ex.amount) || 0) + remaining) * 100) / 100));
    else addPayment('nakit', remaining);
  };
  /** Belirli satıra kalan tutarı yazar (kart/havale/veresiye için) */
  const fillRemaining = (p) => {
    const cur = toNum(p.amount) || 0;
    if (p.method === 'doviz') {
      const rate = quote?.rates?.[p.currency]?.buy;
      if (rate) setPay(p.key, 'amount', String(Math.ceil(((cur * rate + remaining) / rate) * 100) / 100));
    } else if (p.method === 'veresiye' && p.currency === 'HAS') {
      const rate = quote?.rates?.HAS?.sell;
      // 0,001 gr has ≈ 5 ₺ ettiğinden aşağı yuvarlanır; kalan küsurat nakit/kartla kapatılır
      if (rate) setPay(p.key, 'amount', String(Math.floor(((cur * rate + remaining) / rate) * 1000) / 1000));
    } else setPay(p.key, 'amount', String(Math.round((cur + remaining) * 100) / 100));
  };

  const blockers = [];
  if (!cart.length) blockers.push('Sepet boş');
  if (quoteErr) blockers.push(quoteErr.message);
  if (quote && remaining > 1) blockers.push(`Kalan ${money(remaining)} için ödeme ekleyin`);
  if (change > 0 && change - cashPaid > 1) blockers.push('Fazla ödeme yalnızca nakitten para üstü olarak verilebilir');
  if (identityMissing) blockers.push('Kimlik tespiti gerekli');
  if (hasCredit && !customer) blockers.push('Veresiye için müşteri seçin');

  const complete = async () => {
    if (blockers.length || stale) return;
    // Para üstü: sunucu ödemelerin satış tutarına eşit olmasını ister → verilen para üstünü nakit satırlarından düş
    let pays = body.payments.map((p) => ({ ...p }));
    if (change > 0) {
      let left = change;
      for (let i = pays.length - 1; i >= 0 && left > 0.0001; i -= 1) {
        if (pays[i].method !== 'nakit') continue;
        const cut = Math.min(pays[i].amount, left);
        pays[i].amount = Math.round((pays[i].amount - cut) * 100) / 100;
        left -= cut;
      }
      pays = pays.filter((p) => p.method !== 'nakit' || p.amount > 0);
    }
    setBusy(true);
    try {
      const res = await api.post(A('/sales'), { ...body, payments: pays });
      setDone({ ...res, change, customer });
      setCartOpen(false);
      toast(`Satış tamamlandı: ${res.no}`);
    } catch (err) { toast(err); } finally { setBusy(false); }
  };

  const reset = () => {
    setCart([]); setCustomer(null); setDiscount(''); setNote(''); setPayments([]); setQuote(null); setQuoteErr(null); setDone(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // Küsurat indirimi: ara toplamı 10 ₺'nin katına aşağı yuvarlar
  const roundDown = () => {
    const sub = quote?.subtotal;
    if (!sub) return;
    setDiscount(String(Math.round((sub - Math.floor(sub / 10) * 10) * 100) / 100));
  };

  return (
    <>
      <div className="pos">
        {/* ---------- Sol: ürünler ---------- */}
        <section className="stack" aria-label="Ürünler">
          <div className="gb-search">
            <ScanBarcode className="ico" size={20} />
            <input ref={searchRef} className="input lg" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchKey}
              placeholder="Ürün adı, stok kodu veya barkod okutun…" aria-label="Ürün ara veya barkod okut" />
          </div>
          <div className="gb-cats" role="tablist" aria-label="Kategoriler">
            <button type="button" className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>Tümü</button>
            {cats.map((c) => <button type="button" key={c.id} className={String(c.id) === cat ? 'on' : ''} onClick={() => setCat(String(c.id))}>{c.name}</button>)}
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setFreeOpen(true)}><PenLine size={15} />Serbest kalem ekle</button>
            <span className="xs muted">Tartılan ürün, sipariş veya listede olmayan kalemler için</span>
          </div>
          {!products ? <Loading /> : products.length === 0 ? <Empty icon={Search}>Ürün bulunamadı</Empty> : (
            <div className="pos-products">
              {products.map((p) => {
                const out = p.stock_qty <= 0;
                return (
                  <button type="button" key={p.id} className="pos-item" disabled={out} onClick={() => addProduct(p)} title={p.name}>
                    {p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="gb-noimg"><Gem size={28} /></div>}
                    <span className="gb-stock">{out ? <Badge tone="red">Stok yok</Badge> : p.stock_qty <= (p.min_stock || 0) ? <Badge tone="amber">{p.stock_qty} ad.</Badge> : <Badge>{p.stock_qty} ad.</Badge>}</span>
                    <span className="t">{p.name}</span>
                    <span className="gb-meta"><span>{p.karat ? `${p.karat} ayar` : '—'}</span><span>{p.gram ? gram(p.gram) : ''}</span></span>
                    <span className="p">{p.price !== null && p.price !== undefined ? money(p.price) : 'Fiyat yok'}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="gb-pos-pad" />
        </section>

        {/* ---------- Sağ: sepet ve ödeme ---------- */}
        <aside className={`gb-cart-panel ${cartOpen ? 'open' : ''}`} aria-label="Sepet">
          <div className="gb-cart-close row between">
            <b>Sepet ({itemCount})</b>
            <button type="button" className="btn sm" onClick={() => setCartOpen(false)}><X size={16} />Ürünlere dön</button>
          </div>
          <div className="card cart">
            <div className="card-head"><h3><ShoppingCart size={16} style={{ verticalAlign: -2 }} /> Sepet</h3>
              {cart.length > 0 && <button type="button" className="btn ghost sm" onClick={() => { setCart([]); setPayments([]); }}>Temizle</button>}
            </div>
            <div className="card-body stack" style={{ gap: 14 }}>
              {/* Sepet satırları */}
              {cart.length === 0 ? <div className="small muted center" style={{ padding: '14px 0' }}>Ürün seçin veya barkod okutun.</div> : (
                <div>
                  {cart.map((l, i) => {
                    const ql = lineOf(i);
                    const unit = ql ? ql.unit_price : (l.unit_price ?? l.list_price);
                    const listUnit = ql ? ql.list_unit : l.list_price;
                    return (
                      <div className="cart-line gb-cart-line" key={l.key}>
                        <div>
                          <div className="nm">{l.name || l.description}</div>
                          <div className="sub">{[l.karat && `${l.karat} ayar`, toNum(l.gram) ? gram(toNum(l.gram)) : null, !l.product_id && 'serbest kalem'].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="right">
                          <button type="button" className={`gb-price-btn ${l.unit_price !== null && l.unit_price !== undefined && l.product_id ? 'changed' : ''}`}
                            onClick={() => setEditLine({ key: l.key, value: String(unit ?? ''), list: l.product_id ? listUnit : null })} title="Fiyatı değiştir">
                            {money(ql ? ql.total : (unit || 0) * l.qty)}
                          </button>
                          {l.product_id && ql && ql.unit_price !== ql.list_unit && <div className="gb-strike">{money(ql.list_unit * l.qty)}</div>}
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="qty">
                            <button type="button" onClick={() => setQty(l.key, -1)} aria-label="Azalt"><Minus size={14} /></button>
                            <span>{l.qty}</span>
                            <button type="button" onClick={() => setQty(l.key, 1)} aria-label="Artır"><Plus size={14} /></button>
                          </span>
                          {l.qty > 1 && <span className="xs muted">× {money(unit)}</span>}
                        </div>
                        <div className="right"><button type="button" className="btn ghost icon sm" onClick={() => removeLine(l.key)} aria-label="Satırı sil"><Trash2 size={15} /></button></div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Müşteri ve personel */}
              <FieldBox label="Müşteri"><CustomerPicker value={customer} onChange={setCustomer} /></FieldBox>
              {can('staff') && staff.length > 0 && (
                <Select label="Satışı yapan personel" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">— Seçilmedi —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.position ? ` (${s.position})` : ''}</option>)}
                </Select>
              )}

              {/* İndirim */}
              <div className="row" style={{ alignItems: 'flex-end', gap: 8, flexWrap: 'nowrap' }}>
                <div className="grow"><Input label="İndirim (₺)" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
                <button type="button" className="btn" onClick={roundDown} disabled={!quote} title="Ara toplamı 10 ₺'ye aşağı yuvarla">Küsuratı sil</button>
              </div>

              {/* Toplamlar */}
              {cart.length > 0 && (
                <dl className="gb-sum" style={{ margin: 0 }}>
                  <dt>Ara toplam</dt><dd>{quote ? money(quote.subtotal) : '…'}</dd>
                  {quote && (toNum(discount) || 0) > 0 && <><dt>İndirim</dt><dd>− {money(toNum(discount))}</dd></>}
                  {quote && quote.discount_pct > 0 && <><dt>Liste fiyatına göre indirim</dt><dd>%{quote.discount_pct.toLocaleString('tr-TR')}</dd></>}
                  {quote && <><dt>Has karşılığı</dt><dd>{has(quote.has_total)}</dd></>}
                </dl>
              )}
              <div className="row between" style={{ alignItems: 'baseline' }}>
                <span className="muted">Toplam</span>
                <span className="cart-total" style={{ opacity: stale ? 0.55 : 1 }}>{quote ? money(quote.total) : money(0)}</span>
              </div>
              {quoteErr && <div className="alert error"><AlertTriangle size={18} />{quoteErr.message}</div>}
              {identityMissing && (
                <div className="alert warn"><AlertTriangle size={18} /><div>
                  <b>Kimlik tespiti zorunlu.</b> {money(quote.identity_threshold, 0)} ve üzeri satışlarda TC kimlik numarası kayıtlı müşteri seçilmelidir.
                  {customer ? ' Seçili müşterinin TC bilgisi yok; müşteri kartından ekleyin veya yeni kayıt açın.' : ''}
                </div></div>
              )}

              {/* Ödemeler */}
              {cart.length > 0 && (
                <div className="stack" style={{ gap: 10 }}>
                  <b className="small">Ödeme</b>
                  <div className="gb-methods">
                    {PAY_METHODS.map(([m, l, Icon]) => <button type="button" key={m} className="btn" onClick={() => addPayment(m, m === 'altin' ? 0 : payments.length === 0 && remaining > 0 && m !== 'doviz' ? remaining : 0)}><Icon size={16} />{l}</button>)}
                  </div>
                  {payments.map((p) => {
                    const qp = !stale && payIdx[p.key] !== undefined ? quote?.payments?.[payIdx[p.key]] : null;
                    return (
                      <div className="gb-pay" key={p.key}>
                        <div className="gb-pay-head">
                          <b className="small">{METHOD_LABEL[p.method]}</b>
                          <div className="row" style={{ gap: 4 }}>
                            {p.method !== 'altin' && p.method !== 'nakit' && remaining > 0.009 && <button type="button" className="btn ghost sm" onClick={() => fillRemaining(p)}>Kalanı yaz</button>}
                            <button type="button" className="btn ghost icon sm" onClick={() => removePay(p.key)} aria-label="Ödemeyi sil"><X size={16} /></button>
                          </div>
                        </div>
                        {p.method === 'altin' ? (
                          <div className="gb-pay-grid">
                            <Select label="Ayar" value={p.karat} onChange={(e) => setPay(p.key, 'karat', e.target.value)} options={KARATS.filter((k) => k !== '925').map((k) => [k, `${k} ayar`])} />
                            <Input label="Gram" inputMode="decimal" value={p.gram} onChange={(e) => setPay(p.key, 'gram', e.target.value)} placeholder="0,00" />
                            <Input label="Fire %" inputMode="decimal" value={p.fire_pct} onChange={(e) => setPay(p.key, 'fire_pct', e.target.value)} placeholder="0" />
                          </div>
                        ) : (
                          <div className="gb-pay-grid">
                            {p.method === 'doviz' && <Select label="Cins" value={p.currency} onChange={(e) => setPay(p.key, 'currency', e.target.value)} options={[['USD', 'USD $'], ['EUR', 'EUR €'], ['GBP', 'GBP £']]} />}
                            {p.method === 'veresiye' && <Select label="Birim" value={p.currency} onChange={(e) => setPay(p.key, 'currency', e.target.value)} options={[['TRY', 'TL'], ['HAS', 'Gram has']]} />}
                            <Input label={p.method === 'doviz' ? 'Tutar' : p.method === 'veresiye' && p.currency === 'HAS' ? 'Gram has' : 'Tutar (₺)'} inputMode="decimal"
                              value={p.amount} onChange={(e) => setPay(p.key, 'amount', e.target.value)} placeholder="0" />
                          </div>
                        )}
                        {qp && qp.currency !== 'TRY' && <div className="xs muted">{p.method === 'altin' ? `${has(qp.amount)} × ${money(qp.rate)}` : `${curAmount(qp.amount, qp.currency)} × ${money(qp.rate)}`} = <b>{money(qp.amount_try)}</b></div>}
                      </div>
                    );
                  })}
                  {quote && (
                    <>
                      {quote.paid > 0 && <dl className="gb-sum" style={{ margin: 0 }}><dt>Alınan</dt><dd>{money(quote.paid)}</dd></dl>}
                      {remaining > 0.009 ? (
                        <div className="gb-remaining due"><span>Kalan: {money(remaining)}</span>
                          <button type="button" className="btn sm" onClick={addRemainingCash}><Banknote size={15} />Kalanı nakit ekle</button></div>
                      ) : change > 0 ? (
                        <div className="gb-remaining change"><span>Para üstü</span><span className="num">{money(change)}</span></div>
                      ) : quote.paid > 0 ? (
                        <div className="gb-remaining ok"><span>Ödeme tamam</span><CheckCircle2 size={18} /></div>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              {cart.length > 0 && <Input label="Not" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Satış notu (isteğe bağlı)" maxLength={500} />}

              <button type="button" className="btn primary lg block" disabled={busy || stale || blockers.length > 0} onClick={complete}>
                <CheckCircle2 size={20} />{busy ? 'Kaydediliyor…' : 'Satışı tamamla'}
              </button>
              {cart.length > 0 && blockers.length > 0 && !quoteErr && <div className="xs muted center">{blockers.filter((b) => b !== 'Sepet boş').join(' · ')}</div>}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobil: alta sabit sepet özeti */}
      {!cartOpen && (
        <button type="button" className="gb-mbar" onClick={() => setCartOpen(true)} style={{ border: 0, cursor: 'pointer', textAlign: 'left' }}>
          <ShoppingCart size={22} />
          <span className="grow"><small>{itemCount} ürün{remaining > 0.009 && quote ? ` · kalan ${money(remaining)}` : ''}</small><b>{quote ? money(quote.total) : money(0)}</b></span>
          <span className="btn primary sm">Sepeti aç</span>
        </button>
      )}

      {freeOpen && <FreeItemModal onClose={() => setFreeOpen(false)} onAdd={(l) => { setCart((c) => [...c, l]); setFreeOpen(false); }} />}
      {editLine && (
        <PriceModal line={editLine} onClose={() => setEditLine(null)} onSave={(v) => {
          setCart((c) => c.map((l) => (l.key === editLine.key ? { ...l, unit_price: v } : l)));
          setEditLine(null);
        }} />
      )}
      {done && (
        <Modal title="Satış tamamlandı" onClose={reset} footer={<>
          <button className="btn" onClick={reset}><Plus size={16} />Yeni satış</button>
          <button className="btn primary" onClick={() => nav(`/panel/satislar/${done.id}`)}><Receipt size={16} />Fişi göster</button>
        </>}>
          <div className="stack center" style={{ alignItems: 'center' }}>
            <CheckCircle2 size={48} color="var(--success)" />
            <div className="muted">Satış no</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{done.no}</div>
            <div className="cart-total">{money(done.total)}</div>
            {done.change > 0 && <div className="alert info" style={{ justifyContent: 'center' }}>Para üstü: <b>{money(done.change)}</b></div>}
            {done.customer && <div className="small muted">{done.customer.full_name}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Serbest kalem: açıklama, ayar, gram, fiyat */
function FreeItemModal({ onClose, onAdd }) {
  const [f, setF] = useState({ description: '', karat: '22', gram: '', price: '', qty: '1' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const price = toNum(f.price);
  const ok = f.description.trim().length > 1 && price > 0;
  const add = (e) => {
    e?.preventDefault();
    if (!ok) return;
    onAdd({ key: newKey(), product_id: null, description: f.description.trim(), karat: f.karat || null, gram: f.gram, qty: Math.max(1, parseInt(f.qty, 10) || 1), unit_price: price });
  };
  return (
    <Modal title="Serbest kalem ekle" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" onClick={add} disabled={!ok}>Sepete ekle</button>
    </>}>
      <form className="stack" onSubmit={add}>
        <Input label="Açıklama" value={f.description} onChange={set('description')} autoFocus placeholder="Örn. 22 ayar burma bilezik (tartılı)" maxLength={160} />
        <div className="grid c3">
          <Select label="Ayar" value={f.karat} onChange={set('karat')} options={[['', '—'], ...KARATS.map((k) => [k, `${k} ayar`])]} />
          <Input label="Gram" inputMode="decimal" value={f.gram} onChange={set('gram')} placeholder="0,00" />
          <Input label="Adet" inputMode="numeric" value={f.qty} onChange={set('qty')} />
        </div>
        <Input label="Birim fiyat (₺)" inputMode="decimal" value={f.price} onChange={set('price')} placeholder="0" />
        <div className="xs muted">Serbest kalemler stoktan düşülmez; fiyatı siz belirlersiniz.</div>
      </form>
    </Modal>
  );
}

/** Satır birim fiyatını değiştir (indirim sınırı sunucuda denetlenir) */
function PriceModal({ line, onClose, onSave }) {
  const [v, setV] = useState(line.value);
  const n = toNum(v);
  return (
    <Modal title="Birim fiyatı değiştir" onClose={onClose} footer={<>
      {line.list && <button className="btn" onClick={() => onSave(null)}>Liste fiyatına dön</button>}
      <button className="btn primary" disabled={!(n >= 0)} onClick={() => onSave(n)}>Uygula</button>
    </>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (n >= 0) onSave(n); }}>
        {line.list ? <div className="small muted">Liste fiyatı: <b>{money(line.list)}</b></div> : null}
        <Input label="Yeni birim fiyat (₺)" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        {line.list && n > 0 && n < line.list && <div className="xs muted">İndirim: %{(((line.list - n) / line.list) * 100).toFixed(1)} — yetki sınırını sunucu denetler.</div>}
      </form>
    </Modal>
  );
}
