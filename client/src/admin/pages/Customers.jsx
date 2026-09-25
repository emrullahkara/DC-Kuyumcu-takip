import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Users, Cake, Heart, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { money, has, date, waLink, telLink } from '../../lib/format.js';
import { Modal, useToast, Input, Textarea, Check, Loading, Empty, ErrorBox, Badge, Card } from '../../components/ui.jsx';
import './grupC.css';

/**
 * Bakiye gösterimi. Cari kuralı: pozitif = müşteri bize borçlu, negatif = biz müşteriye borçluyuz
 * (emanet, alacak). Renk + kısa etiketle açıkça yazılır.
 */
export function Balance({ value, cur = 'TRY', block }) {
  const v = Number(value) || 0;
  const eps = cur === 'HAS' ? 0.0009 : 0.009;
  if (Math.abs(v) < eps) return <span className="muted">—</span>;
  const txt = cur === 'HAS' ? has(Math.abs(v)) : money(Math.abs(v));
  return (
    <span className={v > 0 ? 'gc-debt' : 'gc-credit'}>
      {txt}{block ? <span className="gc-bal-label">{v > 0 ? 'müşteri borçlu' : 'biz borçluyuz'}</span> : <span className="xs"> {v > 0 ? '(borçlu)' : '(alacaklı)'}</span>}
    </span>
  );
}

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Customers() {
  usePageTitle('Müşteriler');
  const { can, site } = useAuth();
  const canW = can('customers', 'w');
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [debtors, setDebtors] = useState(false);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q.trim());
  const params = new URLSearchParams();
  if (dq) params.set('q', dq);
  if (debtors) params.set('debtors', '1');
  const { data, loading, error } = useApi(A(`/customers?${params}`));
  const reminders = useApi(A('/customers/reminders/upcoming'));
  const rows = data || [];
  const isTc = /^\d{11}$/.test(dq);

  // Toplam açık bakiye (liste üzerinden): alacaklarımız ve borçlarımız ayrı
  const sum = rows.reduce((s, c) => {
    if (c.balance_try > 0) s.recvTry += c.balance_try; else s.payTry -= c.balance_try;
    if (c.balance_has > 0) s.recvHas += c.balance_has; else s.payHas -= c.balance_has;
    return s;
  }, { recvTry: 0, payTry: 0, recvHas: 0, payHas: 0 });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="gc-filters" style={{ marginBottom: 0 }}>
        <label className="gc-search">
          <span className="sr-only">Müşteri ara</span>
          <Search size={18} />
          <input className="input" placeholder="Ad, telefon veya 11 haneli TC kimlik no…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" inputMode="search" />
        </label>
        <button type="button" className={`btn ${debtors ? 'primary' : ''}`} style={{ minHeight: 44 }} onClick={() => setDebtors(!debtors)} aria-pressed={debtors}>
          Yalnızca borçlu / alacaklı
        </button>
        {canW && <button className="btn primary" style={{ minHeight: 44 }} onClick={() => setAdding(true)}><Plus size={16} />Yeni müşteri</button>}
      </div>
      {isTc && <div className="xs muted" style={{ marginTop: -8 }}><ShieldCheck size={12} /> TC ile arama şifreli kör indeks üzerinden yapılır; tam eşleşme gerekir.</div>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
        {!!reminders.data?.length && (
          <Card title={<><Cake size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />Yaklaşan doğum günü & yıldönümleri (14 gün)</>}>
            <div className="gc-remind">
              {reminders.data.map((r) => {
                const bday = r.type === 'Doğum günü';
                const text = bday
                  ? `Sayın ${r.full_name}, doğum gününüzü en içten dileklerimizle kutlarız. Nice mutlu yıllara! — ${site || 'Kuyumcunuz'}`
                  : `Sayın ${r.full_name}, evlilik yıldönümünüzü kutlar, nice mutlu yıllar dileriz. — ${site || 'Kuyumcunuz'}`;
                return (
                  <div key={`${r.id}-${r.type}`}>
                    <span className="gc-days">{r.in_days === 0 ? 'Bugün' : `${r.in_days} gün`}</span>
                    {bday ? <Cake size={16} color="var(--primary)" /> : <Heart size={16} color="var(--danger)" />}
                    <span className="grow" style={{ minWidth: 140 }}>
                      <a href={`/panel/musteriler/${r.id}`} onClick={(e) => { e.preventDefault(); nav(`/panel/musteriler/${r.id}`); }}><b>{r.full_name}</b></a>
                      <span className="small muted"> · {r.type} ({date(r.date).slice(0, 5)})</span>
                    </span>
                    {r.phone && r.marketing_consent
                      ? <a className="btn sm" href={waLink(r.phone, text)} target="_blank" rel="noreferrer"><MessageCircle size={15} />Tebrik gönder</a>
                      : <span className="xs muted">{r.phone ? 'ticari ileti izni yok' : 'telefon yok'}</span>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <section className="card">
          <div className="card-head">
            <h3>{loading ? 'Yükleniyor…' : `${rows.length} müşteri`}</h3>
            <div className="small muted" style={{ textAlign: 'right' }}>
              Alacağımız: <span className="gc-debt">{money(sum.recvTry, 0)}</span>{sum.recvHas > 0 && <> · <span className="gc-debt">{has(sum.recvHas)}</span></>}
              {(sum.payTry > 0 || sum.payHas > 0) && <> — Borcumuz: <span className="gc-credit">{money(sum.payTry, 0)}</span>{sum.payHas > 0 && <> · <span className="gc-credit">{has(sum.payHas)}</span></>}</>}
            </div>
          </div>
          <div className="alert info" style={{ margin: '12px 16px 0', fontSize: 13 }}>
            <span>Bakiye: <b className="gc-debt">kırmızı = müşteri bize borçlu</b>, <b className="gc-credit">yeşil = biz müşteriye borçluyuz</b> (emanet / alacak).</span>
          </div>
          <ErrorBox error={error} />
          {loading && !data ? <Loading /> : !rows.length ? <Empty icon={Users}>{dq || debtors ? 'Aramaya uyan müşteri yok' : 'Henüz müşteri yok'}</Empty> : (
            <>
              <div className="table-wrap gc-desktop" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead>
                    <tr><th>Müşteri</th><th>Telefon</th><th className="right">TL bakiye</th><th className="right">Altın (has) bakiye</th><th className="right">Alışveriş</th><th>Etiket</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="click" onClick={() => nav(`/panel/musteriler/${c.id}`)}>
                        <td><b>{c.full_name}</b>{c.tckn_masked && <div className="xs muted">TC {c.tckn_masked}</div>}</td>
                        <td className="nowrap">{c.phone || '—'}</td>
                        <td className="right num nowrap"><Balance value={c.balance_try} block /></td>
                        <td className="right num nowrap"><Balance value={c.balance_has} cur="HAS" block /></td>
                        <td className="right num nowrap">{c.sale_count ? <>{money(c.sale_total, 0)}<div className="xs muted">{c.sale_count} satış</div></> : <span className="muted">—</span>}</td>
                        <td>{c.tags ? c.tags.split(',').filter(Boolean).slice(0, 3).map((t) => <Badge key={t} tone="gold">{t.trim()}</Badge>) : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="gc-mobile" style={{ padding: 12 }}>
                <div className="gc-list">
                  {rows.map((c) => (
                    <div key={c.id} className="gc-item" role="button" tabIndex={0} onClick={() => nav(`/panel/musteriler/${c.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/panel/musteriler/${c.id}`)}>
                      <div className="gc-main">
                        <div className="gc-title">{c.full_name}</div>
                        <div className="gc-meta">{c.phone ? <span>{c.phone}</span> : null}{c.sale_count ? <span>{c.sale_count} satış</span> : null}</div>
                      </div>
                      <div className="gc-side small">
                        {Math.abs(c.balance_try) >= 0.01 && <Balance value={c.balance_try} block />}
                        {Math.abs(c.balance_has) >= 0.001 && <Balance value={c.balance_has} cur="HAS" block />}
                        {c.phone && <a className="btn sm ghost icon" href={telLink(c.phone)} onClick={(e) => e.stopPropagation()} aria-label="Ara"><Phone size={15} /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {adding && <CustomerForm onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); nav(`/panel/musteriler/${id}`); }} />}
    </div>
  );
}

/** Yeni müşteri / düzenleme formu (CustomerDetail de kullanır) */
export function CustomerForm({ customer, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    full_name: customer?.full_name || '', phone: customer?.phone || '', email: customer?.email || '', tckn: '',
    birth_date: customer?.birth_date || '', anniversary_date: customer?.anniversary_date || '', address: customer?.address || '',
    notes: customer?.notes || '', tags: customer?.tags || '', kvkk_consent: !!customer?.kvkk_consent, marketing_consent: !!customer?.marketing_consent,
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const tcBad = f.tckn && !/^\d{11}$/.test(f.tckn);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { ...f, tckn: f.tckn || null, phone: f.phone.trim() || null, email: f.email.trim() || '' };
    try {
      if (customer) { await api.put(A(`/customers/${customer.id}`), body); toast('Müşteri güncellendi'); onSaved(customer.id); } else {
        const r = await api.post(A('/customers'), body);
        toast('Müşteri eklendi'); onSaved(r.id);
      }
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Modal wide title={customer ? 'Müşteriyi düzenle' : 'Yeni müşteri'} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" form="gc-cust-form" disabled={busy || tcBad}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </>}>
      <form id="gc-cust-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <div className="grid c2">
          <Input label="Ad soyad" required minLength={2} maxLength={100} value={f.full_name} onChange={set('full_name')} autoFocus />
          <Input label="Telefon" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" />
        </div>
        <div className="grid c2">
          <Input label={customer?.tckn_masked ? `TC kimlik no (kayıtlı: ${customer.tckn_masked})` : 'TC kimlik no'}
            hint={customer?.tckn_masked ? 'değiştirmek için yazın' : 'isteğe bağlı'} inputMode="numeric" maxLength={11}
            value={f.tckn} onChange={(e) => setF((s) => ({ ...s, tckn: e.target.value.replace(/\D/g, '') }))} />
          <Input label="E-posta" type="email" value={f.email} onChange={set('email')} />
        </div>
        {tcBad && <div className="xs" style={{ color: 'var(--danger)', marginTop: -6 }}>TC kimlik numarası 11 haneli olmalıdır.</div>}
        <div className="alert warn" style={{ fontSize: 13 }}>
          TC kimlik no isteğe bağlıdır; ancak MASAK kimlik tespiti eşiğini aşan satış ve alışlarda zorunludur. Şifreli saklanır, listede maskeli görünür.
        </div>
        <div className="grid c2">
          <Input label="Doğum günü" type="date" value={f.birth_date} onChange={set('birth_date')} />
          <Input label="Evlilik yıldönümü" type="date" value={f.anniversary_date} onChange={set('anniversary_date')} />
        </div>
        <Input label="Adres" value={f.address} onChange={set('address')} maxLength={300} />
        <div className="grid c2">
          <Input label="Etiketler" hint="virgülle ayırın" value={f.tags} onChange={set('tags')} placeholder="VIP, düğün" maxLength={200} />
          <Textarea label="Notlar" value={f.notes} onChange={set('notes')} maxLength={1000} style={{ minHeight: 42 }} />
        </div>
        <div className="gc-section stack" style={{ gap: 10 }}>
          <Check label="KVKK aydınlatma metni okundu; kişisel verilerin işlenmesine açık rıza verildi" checked={f.kvkk_consent} onChange={set('kvkk_consent')} />
          <Check label="Ticari elektronik ileti (SMS / WhatsApp kampanya, tebrik) izni verildi" checked={f.marketing_consent} onChange={set('marketing_consent')} />
        </div>
      </form>
    </Modal>
  );
}
