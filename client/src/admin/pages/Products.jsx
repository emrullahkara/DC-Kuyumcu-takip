import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Search, Plus, Printer, Gem, Pencil, Trash2, PackagePlus, ImagePlus, Eye, EyeOff, Star, AlertTriangle, Scale, Tag, X,
} from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { usePrices } from '../../hooks/usePrices.js';
import { money, gram, has, dateTime, KARATS, KARAT_MILYEM, KIND_LABEL } from '../../lib/format.js';
import {
  Modal, useToast, useConfirm, Input, Select, Textarea, Check, Seg, Loading, Empty, ErrorBox, Badge, Stat, Card, Field,
} from '../../components/ui.jsx';
import './grupC.css';

const KIND_OPTS = Object.entries(KIND_LABEL);
const LOCATIONS = ['Vitrin', 'Kasa', 'Depo'];
const MOVE_LABEL = { giris: 'Giriş', cikis: 'Çıkış', satis: 'Satış', iade: 'İade', sayim: 'Sayım', alis: 'Alış', iptal: 'Satış iptali' };
const karatLabel = (k) => (k ? (k === '925' ? '925 gümüş' : `${k} ayar`) : '—');

/** Yazdırma: yalnızca .gc-print alanı kâğıda çıkar */
function printArea() {
  document.body.classList.add('gc-printing');
  const done = () => { document.body.classList.remove('gc-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

/** Yazarken her tuşta istek atmamak için gecikmeli değer */
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Products() {
  usePageTitle('Ürünler & Stok');
  const [tab, setTab] = useState('products');
  return (
    <div>
      <div className="tabs" role="tablist">
        {[['products', 'Ürünler'], ['categories', 'Kategoriler'], ['valuation', 'Stok Değeri']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'products' && <ProductsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'valuation' && <ValuationTab />}
    </div>
  );
}

// =====================================================================
// Ürün listesi
// =====================================================================
function ProductsTab() {
  const { can } = useAuth();
  const canW = can('products', 'w');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [kind, setKind] = useState('');
  const [low, setLow] = useState(false);
  const dq = useDebounced(q.trim());
  const params = new URLSearchParams();
  if (dq) params.set('q', dq);
  if (cat) params.set('category_id', cat);
  if (kind) params.set('kind', kind);
  if (low) params.set('low', '1');
  const { data, loading, error, reload } = useApi(A(`/products?${params}`));
  const cats = useApi(A('/products/categories'));
  const [selected, setSelected] = useState(() => new Set());
  const [edit, setEdit] = useState(null); // null | {} (yeni) | ürün
  const [detail, setDetail] = useState(null);
  const [labels, setLabels] = useState(null);

  const rows = data || [];
  const lowCount = rows.filter((p) => p.stock_qty <= p.min_stock).length;
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((p) => p.id)));
  const selectedRows = rows.filter((p) => selected.has(p.id));

  return (
    <>
      <div className="gc-filters">
        <label className="gc-search">
          <span className="sr-only">Ara</span>
          <Search size={18} />
          <input className="input" placeholder="Ürün adı, stok kodu veya barkod okut…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kategori">
          <option value="">Tüm kategoriler</option>
          {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tür">
          <option value="">Tüm türler</option>
          {KIND_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" className={`btn ${low ? 'primary' : ''}`} onClick={() => setLow(!low)} aria-pressed={low} style={{ minHeight: 44 }}>
          <AlertTriangle size={16} />Düşük stok
        </button>
      </div>

      <div className="page-actions">
        <span className="muted small grow">
          {loading ? 'Yükleniyor…' : `${rows.length} ürün`}{!low && lowCount > 0 && <> · <span className="gc-low">{lowCount} ürün minimum stokta/altında</span></>}
        </span>
        <button className="btn" disabled={!selectedRows.length} onClick={() => setLabels(selectedRows)}>
          <Printer size={16} />Etiket yazdır{selectedRows.length ? ` (${selectedRows.length})` : ''}
        </button>
        {canW && <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} />Yeni ürün</button>}
      </div>

      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !rows.length ? (
        <div className="card"><Empty icon={Gem}>{dq || cat || kind || low ? 'Filtreye uyan ürün yok' : 'Henüz ürün eklenmemiş'}</Empty></div>
      ) : (
        <>
          {/* Masaüstü tablo */}
          <div className="card gc-desktop">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Tümünü seç" /></th>
                    <th>Ürün</th><th>Kategori</th><th>Ayar</th><th className="right">Gram</th><th className="right">İşçilik</th>
                    <th className="right">Stok</th><th className="right">Güncel fiyat</th><th>Sitede</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="click" onClick={() => setDetail(p.id)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name} seç`} /></td>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                          <Thumb src={p.image} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{p.name}{p.featured ? <Star size={13} style={{ marginLeft: 4, color: 'var(--primary)' }} /> : null}</div>
                            <div className="xs muted">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''} · {KIND_LABEL[p.kind]}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.category_name || '—'}</td>
                      <td className="nowrap">{karatLabel(p.karat)}</td>
                      <td className="right num nowrap">{p.gram ? gram(p.gram) : '—'}</td>
                      <td className="right num nowrap">{p.labor_milyem ? `${(p.labor_milyem * 1000).toLocaleString('tr-TR')} ‰` : '—'}{p.labor_tl ? <div className="xs muted">+{money(p.labor_tl, 0)}</div> : null}</td>
                      <td className={`right num nowrap ${p.stock_qty <= p.min_stock ? "gc-low" : ""}`}>{p.stock_qty}<span className="xs muted"> / min {p.min_stock}</span></td>
                      <td className="right num nowrap"><b>{money(p.price)}</b><div className="xs muted">{p.price_basis}</div></td>
                      <td>{p.show_on_site ? <Badge tone="green"><Eye size={12} />Görünür</Badge> : <Badge><EyeOff size={12} />Gizli</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Mobil kart görünümü */}
          <div className="gc-mobile">
            <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" checked={allOn} onChange={toggleAll} />Tümünü seç (etiket için)</label>
            <div className="gc-list">
              {rows.map((p) => (
                <div key={p.id} className="gc-item" role="button" tabIndex={0} onClick={() => setDetail(p.id)} onKeyDown={(e) => e.key === 'Enter' && setDetail(p.id)}>
                  <Thumb src={p.image} />
                  <div className="gc-main">
                    <div className="gc-title">{p.name}</div>
                    <div className="gc-meta">
                      <span>{karatLabel(p.karat)}</span>{p.gram ? <span>{gram(p.gram)}</span> : null}<span>{p.sku}</span>
                      {!p.show_on_site && <span>sitede gizli</span>}
                    </div>
                  </div>
                  <div className="gc-side">
                    <b>{money(p.price, 0)}</b>
                    <span className={`small ${p.stock_qty <= p.min_stock ? 'gc-low' : 'muted'}`}>Stok {p.stock_qty}</span>
                    <div onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name} seç`} style={{ width: 22, height: 22, marginTop: 6 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {edit && <ProductForm product={edit.id ? edit : null} categories={cats.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {detail && (
        <ProductDetail id={detail} onClose={() => setDetail(null)} onChanged={reload}
          onEdit={(p) => { setDetail(null); setEdit(p); }} onLabel={(p) => setLabels([p])} />
      )}
      {labels && <LabelsModal items={labels} onClose={() => setLabels(null)} />}
    </>
  );
}

function Thumb({ src, lg }) {
  return <span className={`gc-thumb ${lg ? 'lg' : ''}`}>{src ? <img src={src} alt="" loading="lazy" /> : <Gem size={lg ? 32 : 18} />}</span>;
}

// =====================================================================
// Ürün ekle / düzenle
// =====================================================================
const EMPTY = {
  name: '', sku: '', barcode: '', category_id: '', kind: 'taki', karat: '14', milyem: '0.585', gram: '', labor_milyem: '', labor_tl: '',
  stone_desc: '', stone_price: '', price_mode: 'auto', fixed_price: '', price_code: '', cost_has: '', cost_tl: '', supplier_id: '',
  stock_qty: '1', min_stock: '0', location: 'Vitrin', description: '', image: null,
  show_on_site: true, show_price_on_site: true, featured: false, active: true,
};

/** Sunucudan gelen ürünü form değerlerine çevirir (işçilik milyem ‰ olarak gösterilir) */
function toForm(p) {
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? EMPTY[k]])),
    category_id: s(p.category_id), supplier_id: s(p.supplier_id), karat: s(p.karat), milyem: s(p.milyem), gram: s(p.gram),
    labor_milyem: p.labor_milyem ? String(Math.round(p.labor_milyem * 1000 * 100) / 100) : '', labor_tl: p.labor_tl ? s(p.labor_tl) : '',
    stone_price: p.stone_price ? s(p.stone_price) : '', fixed_price: s(p.fixed_price), cost_has: p.cost_has ? s(p.cost_has) : '', cost_tl: p.cost_tl ? s(p.cost_tl) : '',
    min_stock: s(p.min_stock), price_code: s(p.price_code), location: p.location || '',
    show_on_site: !!p.show_on_site, show_price_on_site: !!p.show_price_on_site, featured: !!p.featured, active: !!p.active,
  };
}

const n = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const nOrNull = (v) => (String(v).trim() === '' ? null : n(v));

function ProductForm({ product, categories, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => (product ? toForm(product) : EMPTY));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const prices = useApi(A('/prices'));
  const live = usePrices();
  const suppliers = useApi(A('/suppliers'));
  const set = (k) => (e) => { const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e; setF((s) => ({ ...s, [k]: v })); };

  // Ayar seçilince milyem otomatik gelir; türe göre makul ayar önerilir
  const setKarat = (e) => { const k = e.target.value; setF((s) => ({ ...s, karat: k, milyem: k ? String(KARAT_MILYEM[k]) : s.milyem })); };
  const setKind = (e) => {
    const k = e.target.value;
    setF((s) => ({ ...s, kind: k, ...(k === 'gumus' ? { karat: '925', milyem: '0.925' } : {}), ...(k !== 'sarrafiye' ? { price_code: '' } : {}) }));
  };

  // Fiyat kaynağı: canlı akış (SSE) varsa onu, yoksa panel fiyat listesini kullan
  const priceItems = prices.data?.items || [];
  const sellOf = (code) => live.byCode[code]?.sell ?? priceItems.find((i) => i.code === code)?.sell ?? null;
  const sarrafiye = priceItems.filter((i) => i.category === 'sarrafiye' || i.category === 'altin');

  const preview = useMemo(() => {
    if (f.price_mode === 'fixed') return { value: nOrNull(f.fixed_price), note: 'Sabit fiyat' };
    if (f.price_code) { const s = sellOf(f.price_code); return { value: s, note: `${f.price_code} satış fiyatı` }; }
    const base = sellOf(f.kind === 'gumus' ? 'GUMUS' : 'HAS');
    if (!base) return { value: null, note: 'Fiyat bilgisi alınamadı' };
    const g = n(f.gram); const m = n(f.milyem); const lm = n(f.labor_milyem) / 1000;
    const value = g * base * (m + lm) + n(f.labor_tl) + n(f.stone_price);
    return { value: value ? Math.ceil(value) : null, note: `${gram(g)} × ${money(base)} × (${m.toFixed(3)} + ${lm.toFixed(3)})${n(f.labor_tl) ? ' + işçilik' : ''}${n(f.stone_price) ? ' + taş' : ''}`, base };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, live.byCode, priceItems]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const r = await api.upload(A('/uploads'), file);
      setF((s) => ({ ...s, image: r.path }));
      toast('Görsel yüklendi');
    } catch (err) { toast(err); } finally { setUploading(false); e.target.value = ''; }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    // Boş sayısal alanlar null/0 gönderilir; aksi hâlde sunucu '' değerini 0 sayar
    const body = {
      name: f.name.trim(), sku: f.sku.trim() || undefined, barcode: f.barcode.trim() || null,
      category_id: f.category_id ? Number(f.category_id) : null, kind: f.kind, karat: f.karat || null, milyem: nOrNull(f.milyem),
      gram: n(f.gram), labor_milyem: n(f.labor_milyem) / 1000, labor_tl: n(f.labor_tl), stone_desc: f.stone_desc || null, stone_price: n(f.stone_price),
      price_code: f.kind === 'sarrafiye' && f.price_code ? f.price_code : null, price_mode: f.price_mode,
      fixed_price: f.price_mode === 'fixed' ? nOrNull(f.fixed_price) : null, cost_has: n(f.cost_has), cost_tl: n(f.cost_tl),
      supplier_id: f.supplier_id ? Number(f.supplier_id) : null, min_stock: Math.round(n(f.min_stock)), location: f.location || null,
      description: f.description || null, image: f.image || null,
      show_on_site: f.show_on_site, show_price_on_site: f.show_price_on_site, featured: f.featured, active: f.active,
    };
    try {
      if (product) await api.put(A(`/products/${product.id}`), body);
      else await api.post(A('/products'), { ...body, stock_qty: Math.round(n(f.stock_qty)) });
      toast(product ? 'Ürün güncellendi' : 'Ürün eklendi');
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const hasEst = n(f.gram) * n(f.milyem);
  return (
    <Modal wide title={product ? `Ürünü düzenle — ${product.name}` : 'Yeni ürün'} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="gc-product-form" className="btn primary" disabled={busy || uploading}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </>}>
      <form id="gc-product-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <div className="grid c2">
          <Input label="Ürün adı" required minLength={2} maxLength={120} value={f.name} onChange={set('name')} autoFocus placeholder="ör. 14 ayar burgu bilezik" />
          <Select label="Kategori" value={f.category_id} onChange={set('category_id')}>
            <option value="">— Kategorisiz —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="grid c3">
          <Select label="Tür" value={f.kind} onChange={setKind} options={KIND_OPTS} />
          <Select label="Ayar" value={f.karat} onChange={setKarat}>
            <option value="">— Yok —</option>
            {KARATS.map((k) => <option key={k} value={k}>{karatLabel(k)}</option>)}
          </Select>
          <Input label="Milyem" hint="ayardan gelir" inputMode="decimal" value={f.milyem} onChange={set('milyem')} placeholder="0.585" />
        </div>
        <div className="grid c3">
          <Input label="Gram" inputMode="decimal" value={f.gram} onChange={set('gram')} placeholder="0,00" />
          <Input label="İşçilik (milyem ‰)" hint="ör. 80" inputMode="decimal" value={f.labor_milyem} onChange={set('labor_milyem')} placeholder="0" />
          <Input label="Sabit işçilik (₺)" inputMode="decimal" value={f.labor_tl} onChange={set('labor_tl')} placeholder="0" />
        </div>
        <div className="grid c2">
          <Input label="Taş açıklaması" value={f.stone_desc} onChange={set('stone_desc')} placeholder="ör. 0,25 ct pırlanta" />
          <Input label="Taş fiyatı (₺)" inputMode="decimal" value={f.stone_price} onChange={set('stone_price')} placeholder="0" />
        </div>

        <div className="gc-section">
          <h4>Fiyatlandırma</h4>
          <div className="stack">
            <Seg value={f.price_mode} onChange={set('price_mode')} options={[['auto', 'Otomatik (canlı has)'], ['fixed', 'Sabit fiyat']]} />
            {f.price_mode === 'fixed' && <Input label="Sabit satış fiyatı (₺)" required inputMode="decimal" value={f.fixed_price} onChange={set('fixed_price')} />}
            {f.price_mode === 'auto' && f.kind === 'sarrafiye' && (
              <Select label="Fiyat kodu" hint="sarrafiye fiyatı doğrudan kurdan gelir" value={f.price_code} onChange={set('price_code')}>
                <option value="">— Gram hesabıyla —</option>
                {sarrafiye.map((i) => <option key={i.code} value={i.code}>{i.name} ({i.code})</option>)}
              </Select>
            )}
            <div className="gc-preview">
              <div className="small muted">Tahmini etiket fiyatı (önizleme)</div>
              <div className="v">{preview.value ? money(preview.value, 0) : '—'}</div>
              <div className="xs muted">{preview.note}. Gerçek fiyatı sunucu, yuvarlama ayarıyla hesaplar.</div>
              {hasEst > 0 && <div className="xs muted">Has karşılığı: {has(hasEst)}</div>}
            </div>
          </div>
        </div>

        <div className="gc-section">
          <h4>Maliyet & stok</h4>
          <div className="grid c3">
            <Input label="Maliyet (has gr)" hint="boşsa gram × milyem" inputMode="decimal" value={f.cost_has} onChange={set('cost_has')} />
            <Input label="Ek maliyet (₺)" inputMode="decimal" value={f.cost_tl} onChange={set('cost_tl')} />
            <Select label="Tedarikçi" value={f.supplier_id} onChange={set('supplier_id')}>
              <option value="">—</option>
              {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div className="grid c3 mt">
            {!product
              ? <Input label="Başlangıç stoğu" inputMode="numeric" value={f.stock_qty} onChange={set('stock_qty')} />
              : <Field label="Stok"><div className="input" style={{ background: 'var(--surface-2)' }}>{product.stock_qty} adet <span className="xs muted">(detaydan hareket girin)</span></div></Field>}
            <Input label="Minimum stok" inputMode="numeric" value={f.min_stock} onChange={set('min_stock')} />
            <Select label="Konum" value={f.location} onChange={set('location')}>
              <option value="">—</option>
              {[...new Set([...LOCATIONS, f.location].filter(Boolean))].map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div className="grid c2 mt">
            <Input label="Stok kodu" hint="boşsa otomatik" value={f.sku} onChange={set('sku')} maxLength={40} />
            <Input label="Barkod" hint="boşsa stok kodu basılır" value={f.barcode} onChange={set('barcode')} maxLength={40} />
          </div>
        </div>

        <div className="gc-section">
          <h4>Web sitesi</h4>
          <div className="stack">
            <Textarea label="Açıklama" value={f.description} onChange={set('description')} maxLength={2000} />
            <div className="gc-upload">
              <Thumb src={f.image} lg />
              <div className="stack" style={{ gap: 8 }}>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
                <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}><ImagePlus size={16} />{uploading ? 'Yükleniyor…' : f.image ? 'Görseli değiştir' : 'Görsel yükle'}</button>
                {f.image && <button type="button" className="btn sm ghost" onClick={() => setF((s) => ({ ...s, image: null }))}><X size={14} />Görseli kaldır</button>}
                <span className="xs muted">JPG, PNG veya WEBP · en fazla 5 MB</span>
              </div>
            </div>
            <div className="gc-checks">
              <Check label="Sitede göster" checked={f.show_on_site} onChange={set('show_on_site')} />
              <Check label="Fiyatı sitede göster" checked={f.show_price_on_site} onChange={set('show_price_on_site')} />
              <Check label="Öne çıkan ürün" checked={f.featured} onChange={set('featured')} />
              <Check label="Aktif (satışta)" checked={f.active} onChange={set('active')} />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================================
// Ürün detayı + stok hareketleri
// =====================================================================
function ProductDetail({ id, onClose, onChanged, onEdit, onLabel }) {
  const { can } = useAuth();
  const canW = can('products', 'w');
  const toast = useToast();
  const confirm = useConfirm();
  const { data: p, loading, error, reload } = useApi(A(`/products/${id}`));
  const [mv, setMv] = useState({ type: 'giris', qty: '', note: '' });
  const [busy, setBusy] = useState(false);

  const addMove = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(A(`/products/${id}/stock`), { type: mv.type, qty: Math.round(n(mv.qty)), note: mv.note || null });
      toast(`Stok güncellendi: ${r.stock_qty} adet`);
      setMv({ type: mv.type, qty: '', note: '' });
      reload(); onChanged();
    } catch (err) { toast(err); } finally { setBusy(false); }
  };

  const deactivate = async () => {
    if (!(await confirm(`"${p.name}" pasife alınsın mı? Satış ekranında ve sitede görünmez; geçmiş hareketler korunur.`, { danger: true, ok: 'Pasife al' }))) return;
    try { await api.del(A(`/products/${id}`)); toast('Ürün pasife alındı'); onChanged(); onClose(); } catch (err) { toast(err); }
  };

  return (
    <Modal wide title={p ? p.name : 'Ürün'} onClose={onClose} footer={p && <>
      <button className="btn" onClick={() => onLabel(p)}><Printer size={16} />Etiket</button>
      {canW && p.active ? <button className="btn danger" onClick={deactivate}><Trash2 size={16} />Pasife al</button> : null}
      {canW && <button className="btn primary" onClick={() => onEdit(p)}><Pencil size={16} />Düzenle</button>}
    </>}>
      <ErrorBox error={error} />
      {loading && !p ? <Loading /> : p && (
        <div className="stack">
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <Thumb src={p.image} lg />
            <div className="grow">
              <div className="row" style={{ gap: 6 }}>
                <Badge tone="gold">{KIND_LABEL[p.kind]}</Badge>
                {!p.active && <Badge tone="red">Pasif</Badge>}
                {p.show_on_site ? <Badge tone="green">Sitede</Badge> : <Badge>Sitede gizli</Badge>}
                {p.featured ? <Badge tone="amber">Öne çıkan</Badge> : null}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }} className="num">{money(p.price)}</div>
              <div className="small muted">Fiyat tabanı: {p.price_basis}{p.labor_amount ? ` · işçilik ${money(p.labor_amount)}` : ''}</div>
            </div>
          </div>
          <dl className="kv">
            <dt>Stok kodu / barkod</dt><dd>{p.sku}{p.barcode ? ` / ${p.barcode}` : ''}</dd>
            <dt>Kategori</dt><dd>{p.category_name || '—'}</dd>
            <dt>Ayar / milyem</dt><dd>{karatLabel(p.karat)}{p.milyem ? ` · ${Number(p.milyem).toFixed(3)}` : ''}</dd>
            <dt>Gram / has</dt><dd>{gram(p.gram)} · {has(p.has_equivalent)}</dd>
            <dt>İşçilik</dt><dd>{(p.labor_milyem * 1000).toLocaleString('tr-TR')} ‰{p.labor_tl ? ` + ${money(p.labor_tl)}` : ''}</dd>
            {p.stone_desc || p.stone_price ? <><dt>Taş</dt><dd>{p.stone_desc || '—'}{p.stone_price ? ` · ${money(p.stone_price)}` : ''}</dd></> : null}
            <dt>Maliyet</dt><dd>{has(p.cost_has)}{p.cost_tl ? ` + ${money(p.cost_tl)}` : ''}</dd>
            <dt>Stok</dt><dd className={p.stock_qty <= p.min_stock ? 'gc-low' : ''}>{p.stock_qty} adet (min {p.min_stock}){p.location ? ` · ${p.location}` : ''}</dd>
            {p.description && <><dt>Açıklama</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{p.description}</dd></>}
          </dl>

          {canW && (
            <form className="gc-section" onSubmit={addMove}>
              <h4>Stok hareketi ekle</h4>
              <div className="stack">
                <Seg value={mv.type} onChange={(v) => setMv({ ...mv, type: v })} options={[['giris', 'Giriş (+)'], ['cikis', 'Çıkış (−)'], ['sayim', 'Sayım (gerçek adet)']]} />
                <div className="grid c2">
                  <Input label={mv.type === 'sayim' ? 'Sayılan adet' : 'Adet'} required inputMode="numeric" value={mv.qty} onChange={(e) => setMv({ ...mv, qty: e.target.value.replace(/\D/g, '') })} />
                  <Input label="Not" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} maxLength={200} placeholder="ör. vitrin sayımı" />
                </div>
                <div className="row end"><button className="btn primary" disabled={busy || mv.qty === ''}><PackagePlus size={16} />Kaydet</button></div>
              </div>
            </form>
          )}

          <div className="gc-section">
            <h4>Stok hareketleri</h4>
            {!p.movements.length ? <Empty>Hareket yok</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Tarih</th><th>Tür</th><th className="right">Adet</th><th>Not</th><th>Kullanıcı</th></tr></thead>
                  <tbody>
                    {p.movements.map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap small">{dateTime(m.ts)}</td>
                        <td>{MOVE_LABEL[m.type] || m.type}</td>
                        <td className={`right num ${m.qty < 0 ? 'down' : 'up'}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                        <td className="small">{m.note || '—'}</td>
                        <td className="small muted">{m.user_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// =====================================================================
// Barkod etiketi yazdırma
// =====================================================================
function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', width: 1.3, height: 32, fontSize: 10, margin: 0, textMargin: 1, background: '#ffffff', lineColor: '#000000' });
    } catch { /* geçersiz karakter: boş kalır */ }
  }, [value]);
  return <svg ref={ref} aria-label={`Barkod ${value}`} />;
}

function LabelsModal({ items, onClose }) {
  const { site } = useAuth();
  const [copies, setCopies] = useState(1);
  const shop = (site || 'Kuyumcu').split(' ').slice(0, 2).join(' ');
  const list = items.flatMap((p) => Array.from({ length: copies }, (_, i) => ({ ...p, _k: `${p.id}-${i}` })));
  return (
    <Modal wide title={`Barkod etiketi — ${items.length} ürün`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Kapat</button>
      <button className="btn primary" onClick={printArea}><Printer size={16} />Yazdır</button>
    </>}>
      <div className="stack">
        <div className="row">
          <Field label="Her üründen kopya"><input className="input" type="number" min={1} max={20} value={copies} style={{ width: 100 }}
            onChange={(e) => setCopies(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} /></Field>
          <span className="small muted grow">Etiket 60 mm genişliğindedir. Yazıcı ayarında kenar boşluğunu "yok" seçin.</span>
        </div>
        <div className="gc-labels-preview gc-print">
          <div className="labels">
            {list.map((p) => (
              <div className="label" key={p._k}>
                <div className="gc-l-shop">{shop}</div>
                <div className="gc-l-name">{p.name}</div>
                <div className="gc-l-row"><span>{karatLabel(p.karat)}</span><span>{p.gram ? gram(p.gram) : ''}</span><span>{p.sku}</span></div>
                <Barcode value={p.barcode || p.sku} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// Kategoriler
// =====================================================================
const slugify = (s) => s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function CategoriesTab() {
  const { can } = useAuth();
  const canW = can('products', 'w');
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi(A('/products/categories'));
  const [edit, setEdit] = useState(null);

  const del = async (c) => {
    if (!(await confirm(`"${c.name}" kategorisi silinsin mi?`, { danger: true, ok: 'Sil' }))) return;
    try { await api.del(A(`/products/categories/${c.id}`)); toast('Kategori silindi'); reload(); } catch (err) { toast(err); }
  };

  return (
    <>
      <div className="page-actions">
        <span className="muted small grow">Kategoriler sitedeki menüde bu sırayla görünür.</span>
        {canW && <button className="btn primary" onClick={() => setEdit({ name: '', slug: '', icon: '', sort: (data?.length || 0) * 10, show_on_site: true })}><Plus size={16} />Yeni kategori</button>}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !data?.length ? <div className="card"><Empty icon={Tag}>Kategori yok</Empty></div> : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Sıra</th><th>Ad</th><th>Adres (slug)</th><th className="right">Ürün</th><th>Sitede</th>{canW && <th />}</tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td className="num muted">{c.sort}</td>
                    <td><b>{c.name}</b></td>
                    <td className="small muted">{c.slug}</td>
                    <td className="right num">{c.count}</td>
                    <td>{c.show_on_site ? <Badge tone="green">Görünür</Badge> : <Badge>Gizli</Badge>}</td>
                    {canW && (
                      <td className="right nowrap">
                        <button className="btn sm ghost icon" onClick={() => setEdit(c)} aria-label="Düzenle"><Pencil size={15} /></button>
                        <button className="btn sm ghost icon" onClick={() => del(c)} aria-label="Sil" disabled={c.count > 0} title={c.count > 0 ? 'Kategoride ürün var' : 'Sil'}><Trash2 size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {edit && <CategoryForm cat={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function CategoryForm({ cat, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ ...cat, icon: cat.icon || '', show_on_site: !!cat.show_on_site });
  const [slugTouched, setSlugTouched] = useState(!!cat.id);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { name: f.name, slug: f.slug, icon: f.icon || null, sort: Number(f.sort) || 0, show_on_site: f.show_on_site };
    try {
      if (cat.id) await api.put(A(`/products/categories/${cat.id}`), body); else await api.post(A('/products/categories'), body);
      toast('Kategori kaydedildi'); onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={cat.id ? 'Kategoriyi düzenle' : 'Yeni kategori'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" form="gc-cat-form" disabled={busy}>Kaydet</button>
    </>}>
      <form id="gc-cat-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <Input label="Kategori adı" required value={f.name} autoFocus
          onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} />
        <Input label="Adres (slug)" hint="küçük harf, rakam, tire" required pattern="[a-z0-9\-]{1,40}" value={f.slug}
          onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value }); }} />
        <div className="grid c2">
          <Input label="Sıra" type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />
          <Input label="Simge" hint="isteğe bağlı" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} />
        </div>
        <Check label="Sitede göster" checked={f.show_on_site} onChange={(e) => setF({ ...f, show_on_site: e.target.checked })} />
      </form>
    </Modal>
  );
}

// =====================================================================
// Stok değeri
// =====================================================================
function ValuationTab() {
  const { data, loading, error } = useApi(A('/products/summary/valuation'));
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const rows = data?.rows || [];
  const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0);
  const totalGram = rows.filter((r) => r.kind !== 'gumus').reduce((s, r) => s + (r.gram || 0), 0);
  return (
    <div className="stack">
      <div className="grid c3">
        <Stat tone="gold" icon={Scale} label="Toplam has (altın)" value={has(data.total_has)} sub="gümüş hariç" />
        <Stat label="Has alış değeri" value={money(data.total_try, 0)} sub="güncel has alış fiyatıyla" />
        <Stat label="Stoktaki ürün" value={`${totalQty.toLocaleString('tr-TR')} adet`} sub={`${gram(totalGram)} altın`} />
      </div>
      <Card title="Tür ve ayara göre stok" pad={false}>
        {!rows.length ? <Empty>Stokta ürün yok</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tür</th><th>Ayar</th><th className="right">Adet</th><th className="right">Gram</th><th className="right">Has</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.karat}`}>
                    <td>{KIND_LABEL[r.kind] || r.kind}</td>
                    <td>{karatLabel(r.karat)}</td>
                    <td className="right num">{r.qty}</td>
                    <td className="right num nowrap">{gram(r.gram)}</td>
                    <td className="right num nowrap">{r.kind === 'gumus' ? <span className="muted">{gram(r.has)} saf gümüş</span> : has(r.has)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="xs muted">Değer, stoktaki altının has karşılığının güncel has alış fiyatıyla çarpımıdır; işçilik ve taş dahil değildir.</p>
    </div>
  );
}
