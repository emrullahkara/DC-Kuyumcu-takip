import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Lock, Eye, EyeOff, Calculator, AlertTriangle, Undo2 } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api, A } from '../../lib/api.js';
import { money, price, num, dateTime, time } from '../../lib/format.js';
import { Card, Loading, Empty, ErrorBox, Badge, Field, Seg, useToast } from '../../components/ui.jsx';
import { useWidth, niceTicks } from './Reports.jsx';
import './grupA.css';

const GROUPS = [['altin', 'Altın'], ['sarrafiye', 'Sarrafiye'], ['gumus', 'Gümüş'], ['doviz', 'Döviz']];
const MODE = {
  live: ['live', 'Canlı', 'green'],
  stale: ['stale', 'Bağlantı yok — son fiyatlar', 'amber'],
  demo: ['demo', 'Demo fiyatlar', 'red'],
};
const EDIT_KEYS = ['margin_type', 'margin_buy', 'margin_sell', 'manual_active', 'manual_buy', 'manual_sell', 'show_on_site'];

/** Önizleme: sunucudaki makas formülünün aynısı (kaydedince sunucu hesaplar) */
function preview(it) {
  if (it.manual_active && Number(it.manual_buy) > 0 && Number(it.manual_sell) > 0) return { buy: Number(it.manual_buy), sell: Number(it.manual_sell) };
  if (!it.source_buy || !it.source_sell) return { buy: it.buy, sell: it.sell };
  const dec = it.code === 'GUMUS' || it.category === 'doviz' ? 4 : 2;
  const r = (n) => Math.round(n * 10 ** dec) / 10 ** dec;
  const mb = Number(it.margin_buy) || 0, ms = Number(it.margin_sell) || 0;
  if (it.margin_type === 'fixed') return { buy: r(it.source_buy - mb), sell: r(it.source_sell + ms) };
  return { buy: r(it.source_buy * (1 - mb / 100)), sell: r(it.source_sell * (1 + ms / 100)) };
}

export default function Prices() {
  usePageTitle('Fiyat & Kur');
  const { can } = useAuth();
  const canW = can('prices', 'w');
  const toast = useToast();
  const { data, error, reload, setData } = useApi(A('/prices'));
  const [drafts, setDrafts] = useState({}); // code → düzenlenmiş alanlar
  const [busy, setBusy] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [sel, setSel] = useState('HAS');

  // Kaynak fiyatlar birkaç saniyede bir değişir: sessizce 20 sn'de bir tazele (taslaklar korunur)
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);

  const items = data?.items || [];
  const byCode = useMemo(() => Object.fromEntries(items.map((i) => [i.code, i])), [items]);
  const merged = (it) => ({ ...it, ...(drafts[it.code] || {}) });
  const dirty = (code) => !!drafts[code] && Object.keys(drafts[code]).length > 0;

  const edit = (code, key, value) => setDrafts((d) => {
    const next = { ...(d[code] || {}), [key]: value };
    const orig = byCode[code];
    // Orijinaliyle aynı olan alanları taslaktan çıkar
    for (const k of Object.keys(next)) if (String(next[k] ?? '') === String(k === 'manual_active' || k === 'show_on_site' ? !!orig[k] : orig[k] ?? '')) delete next[k];
    return { ...d, [code]: next };
  });
  const discard = (code) => setDrafts((d) => { const n = { ...d }; delete n[code]; return n; });

  const save = async (code, patch = drafts[code]) => {
    if (!patch) return;
    const body = {};
    for (const k of EDIT_KEYS) if (k in patch) {
      const v = patch[k];
      body[k] = k === 'manual_active' || k === 'show_on_site' ? !!v : k === 'margin_type' ? v : v === '' || v === null ? (k.startsWith('manual') ? null : 0) : Number(v);
    }
    setBusy((b) => ({ ...b, [code]: true }));
    try {
      const row = await api.put(A(`/prices/${code}`), body);
      setData({ ...data, items: data.items.map((i) => (i.code === code ? row : i)) });
      discard(code);
      toast(`${row.name} güncellendi`);
    } catch (err) { toast(err); } finally { setBusy((b) => ({ ...b, [code]: false })); }
  };
  // Sitede göster anahtarı anında kaydedilir
  const toggleSite = (it) => save(it.code, { show_on_site: !it.show_on_site });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await api.post(A('/prices/refresh'));
      setData({ ...data, items: r.items, status: r.status });
      toast(r.status.mode === 'live' ? 'Fiyatlar kaynaktan güncellendi' : `Kaynak: ${MODE[r.status.mode]?.[1] || r.status.mode}`, r.status.mode === 'live' ? 'ok' : 'error');
    } catch (err) { toast(err); } finally { setRefreshing(false); }
  };

  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const st = data.status || {};
  const [modeCls, modeText, modeTone] = MODE[st.mode] || ['', st.mode, ''];
  const dirtyCount = Object.keys(drafts).filter(dirty).length;

  return (
    <div className="stack ga-page">
      {/* Kaynak durumu */}
      <div className="card card-pad">
        <div className="row between">
          <div className="ga-status">
            <span className={`ga-dot ${modeCls}`} aria-hidden />
            <b>Fiyat kaynağı:</b> <Badge tone={modeTone}>{modeText}</Badge>
            <span className="muted">Son başarılı: {st.lastSuccessAt ? dateTime(st.lastSuccessAt) : '—'}</span>
            {st.lastFetchAt && <span className="muted">Son deneme: {time(st.lastFetchAt)}</span>}
          </div>
          <div className="row">
            {dirtyCount > 0 && <Badge tone="amber">{dirtyCount} kaydedilmemiş değişiklik</Badge>}
            {canW && <button type="button" className="btn" onClick={refresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'ga-spin' : ''} /> Kaynaktan yenile</button>}
          </div>
        </div>
        {st.mode === 'demo' && <div className="alert warn mt-s"><AlertTriangle size={18} />Fiyatlar demo modunda; gerçek piyasa fiyatı değildir. Satışta kullanmadan önce elle sabitleyin veya kaynağı kontrol edin.</div>}
        {st.mode === 'stale' && <div className="alert warn mt-s"><AlertTriangle size={18} />Kaynağa ulaşılamıyor; ekrandaki fiyatlar son başarılı çekimden. {st.lastError && <span className="small">Hata: {st.lastError}</span>}</div>}
        {!canW && <div className="alert info mt-s"><Lock size={18} />Fiyatları yalnızca görüntüleyebilirsiniz.</div>}
      </div>

      <div>
        {/* Masaüstü tablo */}
        <Card title="Fiyat tablosu" pad={false} className="ga-price-table-wrap">
          <div className="table-wrap">
            <table className="table ga-price-table">
              <thead><tr>
                <th>Kalem</th><th className="right">Kaynak alış / satış</th>
                {canW && <><th>Makas</th><th className="right">Alış − / Elle alış</th><th className="right">Satış + / Elle satış</th><th className="center">Elle</th></>}
                <th className="right">Sonuç alış / satış</th><th className="center">Sitede</th>{canW && <th />}
              </tr></thead>
              <tbody>
                {GROUPS.map(([g, gl]) => {
                  const rows = items.filter((i) => i.category === g);
                  if (!rows.length) return null;
                  return [
                    <tr key={g} className="ga-group-head"><td colSpan={canW ? 9 : 4}>{gl}</td></tr>,
                    ...rows.map((raw) => {
                      const it = merged(raw);
                      const isDirty = dirty(raw.code);
                      const res = isDirty ? preview(it) : raw;
                      const man = !!it.manual_active;
                      // Elle sabitlenmişse makas yerine elle alış/satış kutuları gösterilir
                      const inp = (key, label) => (
                        <input className="input num-in" type="number" step="0.01" min={man ? '0' : undefined} value={it[key] ?? ''} aria-label={label}
                          onChange={(e) => edit(raw.code, key, e.target.value)} />
                      );
                      return (
                        <tr key={raw.code} className={`${sel === raw.code ? 'sel' : ''} ${isDirty ? 'dirty' : ''}`} onClick={() => setSel(raw.code)} style={{ cursor: 'pointer' }}>
                          <td>
                            <b>{raw.name}</b>
                            <div className="muted xs">{raw.code} · {raw.unit === 'gram' ? 'gram' : 'adet'}{raw.milyem ? ` · ${raw.milyem}` : ''}</div>
                          </td>
                          <td className="right src nowrap">
                            {price(raw.source_buy, raw.code)} / {price(raw.source_sell, raw.code)}
                            {raw.source_change != null && <div className={`xs ${raw.source_change >= 0 ? 'up' : 'down'}`}>{raw.source_change >= 0 ? '▲' : '▼'} %{num(Math.abs(raw.source_change))}</div>}
                          </td>
                          {canW && (
                            <>
                              <td onClick={(e) => e.stopPropagation()}>
                                <select className="select" value={it.margin_type} onChange={(e) => edit(raw.code, 'margin_type', e.target.value)} aria-label="Makas türü" disabled={man}>
                                  <option value="pct">%</option><option value="fixed">₺</option>
                                </select>
                              </td>
                              <td className="right" onClick={(e) => e.stopPropagation()}>{man ? inp('manual_buy', 'Elle alış') : inp('margin_buy', 'Alış makası')}</td>
                              <td className="right" onClick={(e) => e.stopPropagation()}>{man ? inp('manual_sell', 'Elle satış') : inp('margin_sell', 'Satış makası')}</td>
                              <td className="center" onClick={(e) => e.stopPropagation()}><input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} checked={man} onChange={(e) => edit(raw.code, 'manual_active', e.target.checked)} aria-label="Elle sabitle" title="Fiyatı elle sabitle" /></td>
                            </>
                          )}
                          <td className="right res nowrap" title={isDirty ? 'Önizleme — kaydedilmedi' : ''}>
                            {isDirty ? <i>{price(res.buy, raw.code)} / {price(res.sell, raw.code)}</i> : <>{price(res.buy, raw.code)} / {price(res.sell, raw.code)}</>}
                            {!!raw.manual_active && !isDirty && <div><Badge tone="gold"><Lock size={10} /> Sabit</Badge></div>}
                            {isDirty && <div className="xs muted">önizleme</div>}
                          </td>
                          <td className="center" onClick={(e) => e.stopPropagation()}>
                            {canW ? (
                              <button type="button" className="btn ghost icon sm" onClick={() => toggleSite(raw)} disabled={busy[raw.code]} title={raw.show_on_site ? 'Sitede gösteriliyor — gizle' : 'Sitede gizli — göster'} aria-pressed={!!raw.show_on_site}>
                                {raw.show_on_site ? <Eye size={17} color="var(--success)" /> : <EyeOff size={17} color="var(--muted)" />}
                              </button>
                            ) : raw.show_on_site ? <Eye size={16} color="var(--success)" /> : <EyeOff size={16} color="var(--muted)" />}
                          </td>
                          {canW && (
                            <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                              {isDirty && (
                                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                                  <button type="button" className="btn sm primary" onClick={() => save(raw.code)} disabled={busy[raw.code]}><Save size={14} /> Kaydet</button>
                                  <button type="button" className="btn sm ghost icon" onClick={() => discard(raw.code)} title="Değişikliği geri al" aria-label="Geri al"><Undo2 size={14} /></button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobil kart görünümü */}
        <div className="ga-price-cards">
          {GROUPS.map(([g, gl]) => {
            const rows = items.filter((i) => i.category === g);
            if (!rows.length) return null;
            return (
              <div key={g} className="stack" style={{ gap: 8 }}>
                <div className="xs muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 6 }}>{gl}</div>
                {rows.map((raw) => <PriceCard key={raw.code} raw={raw} it={merged(raw)} isDirty={dirty(raw.code)} canW={canW} sel={sel === raw.code}
                  onSelect={() => setSel(raw.code)} edit={(k, v) => edit(raw.code, k, v)} save={() => save(raw.code)} discard={() => discard(raw.code)}
                  toggleSite={() => toggleSite(raw)} busy={busy[raw.code]} />)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid c2" style={{ alignItems: 'start' }}>
        <History item={byCode[sel]} items={items} onSelect={setSel} />
        <QuickCalc karats={data.karats} byCode={byCode} />
      </div>
    </div>
  );
}

/** Mobilde tek fiyat kalemi kartı */
function PriceCard({ raw, it, isDirty, canW, sel, onSelect, edit, save, discard, toggleSite, busy }) {
  const res = isDirty ? preview(it) : raw;
  const [open, setOpen] = useState(false);
  return (
    <div className={`ga-pcard ${sel ? 'sel' : ''}`} onClick={onSelect}>
      <div className="top">
        <div><b>{raw.name}</b>{!!raw.manual_active && <> <Badge tone="gold"><Lock size={10} /> Sabit</Badge></>}<div className="muted xs">Kaynak: {price(raw.source_buy, raw.code)} / {price(raw.source_sell, raw.code)}</div></div>
        <div className="right num">
          <div className="xs muted">Alış / Satış</div>
          <b className={isDirty ? 'muted' : ''}>{price(res.buy, raw.code)} / {price(res.sell, raw.code)}</b>
        </div>
      </div>
      <div className="row between mt-s" onClick={(e) => e.stopPropagation()}>
        {canW ? (
          <button type="button" className="btn sm ghost" onClick={toggleSite} disabled={busy}>
            {raw.show_on_site ? <><Eye size={15} color="var(--success)" /> Sitede</> : <><EyeOff size={15} /> Gizli</>}
          </button>
        ) : <span className="xs muted">{raw.show_on_site ? 'Sitede gösteriliyor' : 'Sitede gizli'}</span>}
        {canW && <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)}>{open ? 'Kapat' : 'Makas / elle'}</button>}
      </div>
      {canW && open && (
        <div onClick={(e) => e.stopPropagation()}>
          <div className="fields">
            <Field label="Makas türü"><Seg value={it.margin_type} onChange={(v) => edit('margin_type', v)} options={[['pct', '%'], ['fixed', '₺']]} /></Field>
            <Field label="Elle sabitle"><label className="check"><input type="checkbox" checked={!!it.manual_active} onChange={(e) => edit('manual_active', e.target.checked)} /> Sabit fiyat</label></Field>
            {it.manual_active ? (
              <>
                <Field label="Elle alış"><input className="input" type="number" inputMode="decimal" value={it.manual_buy ?? ''} onChange={(e) => edit('manual_buy', e.target.value)} /></Field>
                <Field label="Elle satış"><input className="input" type="number" inputMode="decimal" value={it.manual_sell ?? ''} onChange={(e) => edit('manual_sell', e.target.value)} /></Field>
              </>
            ) : (
              <>
                <Field label={`Alış makası (${it.margin_type === 'pct' ? '%' : '₺'})`}><input className="input" type="number" inputMode="decimal" value={it.margin_buy ?? ''} onChange={(e) => edit('margin_buy', e.target.value)} /></Field>
                <Field label={`Satış makası (${it.margin_type === 'pct' ? '%' : '₺'})`}><input className="input" type="number" inputMode="decimal" value={it.margin_sell ?? ''} onChange={(e) => edit('margin_sell', e.target.value)} /></Field>
              </>
            )}
          </div>
          {isDirty && (
            <div className="row mt-s">
              <button type="button" className="btn primary grow" onClick={save} disabled={busy}><Save size={16} /> Kaydet</button>
              <button type="button" className="btn" onClick={discard}>Geri al</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Seçili kalemin fiyat geçmişi (SVG çizgi grafik) */
function History({ item, items, onSelect }) {
  const [days, setDays] = useState('7');
  const code = item?.code;
  const { data, loading, error } = useApi(code ? A(`/prices/history/${code}?days=${days}`) : null);
  const [ref, width] = useWidth();
  const height = 200;

  const chart = useMemo(() => {
    if (!data || data.length < 2) return null;
    const padL = 58, padR = 10, padT = 10, padB = 24;
    const vals = data.flatMap((d) => [d.buy, d.sell]).filter((v) => v != null);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const span = hi - lo;
    // Ekseni sıfırdan değil, dalgalanma aralığından başlat
    const ticksRel = niceTicks(span * 1.1, 4);
    const step = ticksRel[1] - ticksRel[0];
    const base = Math.floor(lo / step) * step;
    const ticks = []; for (let v = base; v <= hi + step * 0.999; v += step) ticks.push(v);
    const top = ticks[ticks.length - 1];
    const t0 = new Date(data[0].ts).getTime(), t1 = new Date(data[data.length - 1].ts).getTime() || t0 + 1;
    const x = (ts) => padL + ((new Date(ts).getTime() - t0) / Math.max(1, t1 - t0)) * (width - padL - padR);
    const y = (v) => padT + (1 - (v - base) / (top - base)) * (height - padT - padB);
    const path = (k) => data.filter((d) => d[k] != null).map((d, i) => `${i ? 'L' : 'M'}${x(d.ts).toFixed(1)},${y(d[k]).toFixed(1)}`).join('');
    const area = `${path('sell')}L${x(data[data.length - 1].ts).toFixed(1)},${height - padB}L${padL},${height - padB}Z`;
    const xLabels = [0, 0.5, 1].map((f) => { const ts = t0 + (t1 - t0) * f; return { x: padL + f * (width - padL - padR), ts }; });
    return { ticks, y, x, path, area, xLabels, padL, padR, padB };
  }, [data, width]);

  const last = data?.[data.length - 1];
  const first = data?.[0];
  const chg = last && first && first.sell ? ((last.sell - first.sell) / first.sell) * 100 : null;
  const fmtX = (ts) => (days === '1' ? new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }));

  return (
    <Card title="Fiyat geçmişi" actions={<Seg value={days} onChange={setDays} options={[['1', '1G'], ['7', '7G'], ['30', '30G'], ['90', '90G']]} />}>
      <div className="row between mb">
        <select className="select" style={{ maxWidth: 240 }} value={code || ''} onChange={(e) => onSelect(e.target.value)} aria-label="Kalem seç">
          {items.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}
        </select>
        {chg != null && <span className={`num ${chg >= 0 ? 'up' : 'down'}`}><b>{chg >= 0 ? '▲' : '▼'} %{num(Math.abs(chg))}</b> <span className="muted small">dönemde</span></span>}
      </div>
      <ErrorBox error={error} />
      <div ref={ref}>
        {loading && !data ? <Loading /> : !chart ? <Empty>Bu dönem için yeterli geçmiş yok (fiyatlar 10 dakikada bir kaydedilir)</Empty> : (
          <>
            <svg className="ga-chart" width={width} height={height} role="img" aria-label={`${item?.name} fiyat geçmişi`}>
              {chart.ticks.map((t) => (
                <g key={t}>
                  <line className="grid-line" x1={chart.padL} x2={width - chart.padR} y1={chart.y(t)} y2={chart.y(t)} />
                  <text x={chart.padL - 6} y={chart.y(t) + 4} textAnchor="end">{price(t, code)}</text>
                </g>
              ))}
              <path className="area" d={chart.area} opacity="0.6" />
              <path className="line-buy" d={chart.path('buy')} />
              <path className="line-sell" d={chart.path('sell')} />
              {chart.xLabels.map((l, i) => <text key={i} x={l.x} y={height - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{fmtX(l.ts)}</text>)}
              {/* Nokta ipuçları: çok nokta varsa seyrelt */}
              {data.filter((_, i) => i % Math.ceil(data.length / 60) === 0 || i === data.length - 1).map((d, i) => (
                <circle key={i} className="dot" cx={chart.x(d.ts)} cy={chart.y(d.sell)} r="3" opacity="0.001" style={{ pointerEvents: 'all' }}>
                  <title>{`${dateTime(d.ts)} — Alış ${price(d.buy, code)} · Satış ${price(d.sell, code)}`}</title>
                </circle>
              ))}
            </svg>
            <div className="ga-legend mt-s">
              <span><i style={{ background: 'var(--primary)' }} />Satış</span>
              <span><i style={{ background: 'var(--info)' }} />Alış</span>
              {last && <span>Son: {price(last.buy, code)} / {price(last.sell, code)}</span>}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** Ayar + gram → has karşılığı ve TL değeri */
function QuickCalc({ karats, byCode }) {
  const [karat, setKarat] = useState('22');
  const [gr, setGr] = useState('');
  const k = karats?.[karat];
  const g = Number(String(gr).replace(',', '.')) || 0;
  const silver = karat === '925';
  const ref = silver ? byCode.GUMUS : byCode.HAS;
  const pure = g * (k?.milyem || 0);
  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Calculator size={17} /> Hızlı hesap</span>}>
      <div className="stack">
        <Field label="Ayar">
          <Seg value={karat} onChange={setKarat} options={Object.keys(karats || {}).map((c) => [c, c === '925' ? '925 ‰' : `${c}K`])} />
        </Field>
        <Field label="Gram" hint={k ? `${k.label} · milyem ${k.milyem}` : ''}>
          <input className="input lg" type="number" inputMode="decimal" min="0" step="0.01" value={gr} onChange={(e) => setGr(e.target.value)} placeholder="Ör. 12,40" />
        </Field>
        <div className="ga-calc-out">
          <div><small>{silver ? 'Saf gümüş karşılığı' : 'Has karşılığı'}</small><b>{num(Math.round(pure * 1000) / 1000)} gr</b></div>
          <div><small>Alış değeri (biz alırsak)</small><b>{ref?.buy ? money(pure * ref.buy) : '—'}</b></div>
          <div><small>Satış değeri (işçiliksiz)</small><b>{ref?.sell ? money(pure * ref.sell) : '—'}</b></div>
        </div>
        <p className="muted xs" style={{ margin: 0 }}>
          {silver ? 'Gümüş' : 'Has altın'} {ref ? `alış ${price(ref.buy, ref.code)} / satış ${price(ref.sell, ref.code)}` : ''} × milyem × gram. İşçilik ve taş dahil değildir; kesin tutar satış/alış ekranında sunucuda hesaplanır.
        </p>
      </div>
    </Card>
  );
}
