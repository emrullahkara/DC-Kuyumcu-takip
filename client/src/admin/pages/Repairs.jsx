import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Printer, MessageCircle, Pencil, Camera, Clock, Phone, ArrowRight, AlertTriangle } from 'lucide-react';
import { api, A } from '../../lib/api.js';
import { money, gram, date, dateTime, today, KARATS, REPAIR_STATUS, REPAIR_KIND, waLink, telLink } from '../../lib/format.js';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Modal, useToast, Input, Select, Textarea, Check, Loading, Empty, ErrorBox, Badge } from '../../components/ui.jsx';
import { CustomerPicker, FieldBox, useDebounced, toNum } from './Pos.jsx';
import { useBusinessName } from './SaleDetail.jsx';
import './grupB.css';

const OPEN = ['alindi', 'atolyede', 'hazir'];
// Sunucudaki durum akışıyla aynı (server/src/routes/repairs.js STATUS_FLOW)
const FLOW = { alindi: ['atolyede', 'hazir', 'iptal'], atolyede: ['hazir', 'alindi', 'iptal'], hazir: ['teslim', 'atolyede'], teslim: [], iptal: [] };
const ACCOUNTS = [['kasa', 'Nakit (kasa)'], ['pos', 'Kart (POS)'], ['banka', 'Havale (banka)']];

const isLate = (r) => OPEN.includes(r.status) && r.due_date && r.due_date < today();
const readyText = (r, biz) => `Sayın ${r.customer_name || 'müşterimiz'}, ${r.no} numaralı ${REPAIR_KIND[r.kind]?.toLocaleLowerCase('tr') || 'iş'} işiniz (${r.item_desc}) hazırdır. `
  + `Mağazamızdan teslim alabilirsiniz.${r.estimated_price - r.deposit > 0 ? ` Kalan ödeme: ${money(r.estimated_price - r.deposit)}.` : ''} İyi günler dileriz. — ${biz || 'Kuyumcunuz'}`;

export default function Repairs() {
  usePageTitle('Tamir & Sipariş');
  const { can } = useAuth();
  const canWrite = can('repairs', 'w');
  const [view, setView] = useState('open');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null); // null | {} (yeni) | kayıt (düzenle)
  const biz = useBusinessName();

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (view === 'open') p.set('open', '1'); else if (view !== 'all') p.set('status', view);
    if (dq) p.set('q', dq);
    return A(`/repairs?${p}`);
  }, [view, dq]);
  const { data, loading, error, reload } = useApi(url);
  const lateCount = (data || []).filter(isLate).length;

  return (
    <>
    {/* İş emri fişi yazdırılırken arka plandaki pano basılmasın */}
    <div className={`stack ${openId ? 'no-print' : ''}`} style={{ gap: 16 }}>
      <div className="page-actions" style={{ marginBottom: 0 }}>
        <input className="input grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="İş no, ürün veya müşteri ara" style={{ flex: 1 }} />
        {canWrite && <button className="btn primary" onClick={() => setForm({})}><Plus size={16} />Yeni iş emri</button>}
      </div>
      <div className="tabs" role="tablist" style={{ marginBottom: 0 }}>
        {[['open', 'Açık işler (pano)'], ['teslim', 'Teslim edildi'], ['iptal', 'İptal'], ['all', 'Tümü']].map(([k, l]) => (
          <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>
      {view === 'open' && lateCount > 0 && <div className="alert error"><AlertTriangle size={18} /><b>{lateCount} iş teslim tarihini geçti.</b> Kırmızı işaretli kartları kontrol edin.</div>}
      <ErrorBox error={error} />

      {loading && !data ? <Loading /> : view === 'open' ? (
        <div className="gb-board">
          {OPEN.map((st) => {
            const list = (data || []).filter((r) => r.status === st);
            return (
              <section className="gb-col" key={st} aria-label={REPAIR_STATUS[st][0]}>
                <div className="gb-col-head"><span>{REPAIR_STATUS[st][0]}</span><Badge tone={REPAIR_STATUS[st][1]}>{list.length}</Badge></div>
                {list.length === 0 ? <div className="xs muted center" style={{ padding: 12 }}>İş yok</div> : list.map((r) => <JobCard key={r.id} r={r} onClick={() => setOpenId(r.id)} />)}
              </section>
            );
          })}
        </div>
      ) : !data?.length ? <Empty>Kayıt yok</Empty> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>No</th><th>Tür</th><th>Ürün</th><th className="gb-hide-sm">Müşteri</th><th className="gb-hide-md">Teslim tarihi</th><th className="right gb-hide-sm">Ücret</th><th>Durum</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="click" onClick={() => setOpenId(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(r.id)}>
                  <td className="nowrap"><b>{r.no}</b></td>
                  <td>{REPAIR_KIND[r.kind]}</td>
                  <td>{r.item_desc}</td>
                  <td className="gb-hide-sm">{r.customer_name || '—'}</td>
                  <td className={`gb-hide-md nowrap ${isLate(r) ? 'gb-late' : ''}`}>{date(r.due_date)}</td>
                  <td className="right num nowrap gb-hide-sm">{money(r.final_price ?? r.estimated_price)}</td>
                  <td><Badge tone={REPAIR_STATUS[r.status][1]}>{REPAIR_STATUS[r.status][0]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

      {openId && <JobModal id={openId} biz={biz} canWrite={canWrite} onClose={() => setOpenId(null)} onChanged={reload}
        onEdit={(r) => { setOpenId(null); setForm(r); }} />}
      {form && <JobForm initial={form} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); reload(); if (id) setOpenId(id); }} />}
    </>
  );
}

function JobCard({ r, onClick }) {
  const late = isLate(r);
  return (
    <button type="button" className={`gb-job ${late ? 'late' : ''}`} onClick={onClick}>
      <div className="top"><b className="small">{r.no}</b><Badge>{REPAIR_KIND[r.kind]}</Badge></div>
      <div className="desc">{r.item_desc}</div>
      <div className="meta">
        <span>{r.customer_name || 'Müşterisiz'}</span>
        {r.karat && <span>{r.karat} ayar</span>}
        {r.gram_in ? <span>{gram(r.gram_in)}</span> : null}
      </div>
      <div className="meta">
        {r.due_date && <span className={late ? 'gb-late' : ''}><Clock size={12} style={{ verticalAlign: -1 }} /> {date(r.due_date)}{late ? ' — gecikti' : ''}</span>}
        {r.staff_name && <span>Usta: {r.staff_name}</span>}
        {r.estimated_price > 0 && <span>{money(r.estimated_price)}{r.deposit > 0 ? ` (kapora ${money(r.deposit)})` : ''}</span>}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* İş emri detayı + durum değişimi + yazdırma                          */
/* ------------------------------------------------------------------ */
function JobModal({ id, biz, canWrite, onClose, onChanged, onEdit }) {
  const toast = useToast();
  const { data: r, loading, error, reload } = useApi(A(`/repairs/${id}`));
  const [next, setNext] = useState(null);

  if (loading && !r) return <Modal title="İş emri" onClose={onClose}><Loading /></Modal>;
  if (error) return <Modal title="İş emri" onClose={onClose}><ErrorBox error={error} /></Modal>;
  if (!r) return null;
  const late = isLate(r);
  const closed = ['teslim', 'iptal'].includes(r.status);

  const quickStatus = async (status) => {
    try {
      await api.post(A(`/repairs/${r.id}/status`), { status });
      toast(`Durum: ${REPAIR_STATUS[status][0]}`);
      reload(); onChanged();
    } catch (e) { toast(e); }
  };
  const go = (st) => (st === 'teslim' || st === 'iptal' ? setNext(st) : quickStatus(st));

  return (
    <Modal title={`${r.no} · ${REPAIR_KIND[r.kind]}`} onClose={onClose} wide footer={<>
      <button className="btn" onClick={() => window.print()}><Printer size={16} />İş emri fişi yazdır</button>
      {canWrite && !closed && <button className="btn" onClick={() => onEdit(r)}><Pencil size={16} />Düzenle</button>}
      <button className="btn" onClick={onClose}>Kapat</button>
    </>}>
      <div className="stack">
        <div className="stack no-print">
          <div className="row">
            <Badge tone={REPAIR_STATUS[r.status][1]}>{REPAIR_STATUS[r.status][0]}</Badge>
            {late && <Badge tone="red">Gecikti</Badge>}
          </div>
          {r.status === 'hazir' && r.customer_phone && (
            <a className="btn primary block" href={waLink(r.customer_phone, readyText(r, biz))} target="_blank" rel="noreferrer">
              <MessageCircle size={18} />Müşteriye “işiniz hazır” mesajı gönder (WhatsApp)
            </a>
          )}
          {canWrite && FLOW[r.status].length > 0 && (
            <div className="row" style={{ gap: 8 }}>
              <span className="small muted">Durumu değiştir:</span>
              {FLOW[r.status].map((st) => (
                <button key={st} type="button" className={`btn sm ${st === 'iptal' ? 'danger' : st === 'teslim' || st === 'hazir' ? 'primary' : ''}`} onClick={() => go(st)}>
                  <ArrowRight size={14} />{REPAIR_STATUS[st][0]}
                </button>
              ))}
            </div>
          )}
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Müşteri</dt><dd>{r.customer_name || '—'}{r.customer_phone && <> · <a href={telLink(r.customer_phone)}><Phone size={13} style={{ verticalAlign: -2 }} /> {r.customer_phone}</a></>}</dd>
            <dt>Ürün</dt><dd>{r.item_desc}</dd>
            <dt>Ayar / gram</dt><dd>{r.karat ? `${r.karat} ayar` : '—'} · {r.gram_in ? gram(r.gram_in) : '—'}</dd>
            {r.issue && <><dt>Sorun / istek</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.issue}</dd></>}
            <dt>Tahmini ücret</dt><dd className="num">{money(r.estimated_price)}</dd>
            <dt>Kapora</dt><dd className="num">{money(r.deposit)}</dd>
            {r.final_price !== null && r.final_price !== undefined && <><dt>Son ücret</dt><dd className="num"><b>{money(r.final_price)}</b></dd></>}
            <dt>Teslim tarihi</dt><dd className={late ? 'gb-late' : ''}>{date(r.due_date)}</dd>
            <dt>Usta</dt><dd>{r.staff_name || '—'}</dd>
            <dt>Alındı</dt><dd>{dateTime(r.created_at)}</dd>
            {r.delivered_at && <><dt>Teslim edildi</dt><dd>{dateTime(r.delivered_at)}</dd></>}
            {r.note && <><dt>Not</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.note}</dd></>}
          </dl>
          {r.photo && <a href={r.photo} target="_blank" rel="noreferrer"><img className="gb-photo" src={r.photo} alt="İş emri fotoğrafı" /></a>}
          {r.payments?.length > 0 && (
            <div className="small">
              <b>Tahsilatlar</b>
              {r.payments.map((m) => (
                <div key={m.id} className={`row between ${m.cancelled ? 'muted' : ''}`}>
                  <span>{dateTime(m.ts)} · {m.description}</span><span className="num">{m.direction === 'out' ? '− ' : ''}{money(m.amount_try)}</span>
                </div>
              ))}
            </div>
          )}
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <b className="small">Müşteri nüshası (yazdırma önizleme)</b>
        </div>

        {/* Yazdırılabilir iş emri fişi */}
        <div className="receipt">
          <h4>{biz || 'Kuyumcu'}</h4>
          <div className="r-center">İŞ EMRİ — MÜŞTERİ NÜSHASI</div>
          <hr />
          <div className="r-row"><span>İş no</span><b>{r.no}</b></div>
          <div className="r-row"><span>Tarih</span><span>{dateTime(r.created_at)}</span></div>
          <div className="r-row"><span>İşlem</span><span>{REPAIR_KIND[r.kind]}</span></div>
          {r.customer_name && <div className="r-row"><span>Müşteri</span><span>{r.customer_name}</span></div>}
          <hr />
          <div>Ürün: {r.item_desc}</div>
          <div className="r-row"><span>Ayar</span><span>{r.karat ? `${r.karat} ayar` : '—'}</span></div>
          <div className="r-row"><span>Giriş gramı</span><span>{r.gram_in ? gram(r.gram_in) : '—'}</span></div>
          {r.issue && <div style={{ marginTop: 4 }}>Açıklama: {r.issue}</div>}
          <hr />
          <div className="r-row"><span>Tahmini ücret</span><span>{money(r.estimated_price)}</span></div>
          <div className="r-row"><span>Alınan kapora</span><span>{money(r.deposit)}</span></div>
          <div className="r-row"><span>Teslim tarihi</span><b>{date(r.due_date)}</b></div>
          <hr />
          <div className="xs">Bu fiş ibraz edilmeden ürün teslim edilmez. 90 gün içinde teslim alınmayan ürünlerden işletme sorumlu değildir.</div>
          <div className="r-sign"><span>Teslim eden (müşteri)</span><span>Teslim alan (işletme)</span></div>
        </div>
      </div>

      {next && <StatusModal r={r} status={next} onClose={() => setNext(null)} onDone={() => { setNext(null); reload(); onChanged(); }} />}
    </Modal>
  );
}

function StatusModal({ r, status, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ final_price: String(r.estimated_price || ''), gram_out: '', account: 'kasa', refund_deposit: r.deposit > 0, note: '' });
  const [busy, setBusy] = useState(false);
  const final = toNum(f.final_price) ?? r.estimated_price;
  const remaining = Math.max(0, final - r.deposit);
  const save = async () => {
    setBusy(true);
    try {
      const body = { status, note: f.note.trim() || undefined };
      if (status === 'teslim') Object.assign(body, { final_price: final, account: f.account, gram_out: toNum(f.gram_out) });
      if (status === 'iptal') body.refund_deposit = !!f.refund_deposit;
      await api.post(A(`/repairs/${r.id}/status`), body);
      toast(status === 'teslim' ? `Teslim edildi${remaining > 0 ? `; ${money(remaining)} tahsil edildi` : ''}` : 'İş emri iptal edildi');
      onDone();
    } catch (e) { toast(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={status === 'teslim' ? `${r.no} teslim` : `${r.no} iptal`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className={`btn ${status === 'iptal' ? 'danger' : 'primary'}`} disabled={busy} onClick={save}>{status === 'teslim' ? 'Teslim et' : 'İptal et'}</button>
    </>}>
      <div className="stack">
        {status === 'teslim' ? (
          <>
            <div className="grid c2">
              <Input label="Son ücret (₺)" inputMode="decimal" value={f.final_price} onChange={(e) => setF({ ...f, final_price: e.target.value })} autoFocus />
              <Input label="Çıkış gramı" hint="kontrol için" inputMode="decimal" value={f.gram_out} onChange={(e) => setF({ ...f, gram_out: e.target.value })} placeholder={r.gram_in ? String(r.gram_in) : ''} />
            </div>
            {r.gram_in && toNum(f.gram_out) > 0 && Math.abs(toNum(f.gram_out) - r.gram_in) > 0.005 && (
              <div className="alert warn"><AlertTriangle size={18} />Gram farkı: {gram(Math.round((toNum(f.gram_out) - r.gram_in) * 1000) / 1000)} (giriş {gram(r.gram_in)})</div>
            )}
            <div className="gb-sum">
              <dt>Son ücret</dt><dd>{money(final)}</dd>
              <dt>Alınan kapora</dt><dd>− {money(r.deposit)}</dd>
              <dt className="big">Tahsil edilecek</dt><dd className="big">{money(remaining)}</dd>
            </div>
            {remaining > 0 && <Select label="Tahsilat hesabı" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} options={ACCOUNTS} />}
          </>
        ) : (
          <>
            <div className="alert warn"><AlertTriangle size={18} />İptal edilen iş emri tekrar açılamaz.</div>
            {r.deposit > 0 && <Check checked={f.refund_deposit} onChange={(e) => setF({ ...f, refund_deposit: e.target.checked })} label={`${money(r.deposit)} kaporayı kasadan nakit iade et`} />}
          </>
        )}
        <Input label="Not" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Yeni / düzenle formu                                                */
/* ------------------------------------------------------------------ */
function JobForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const { can } = useAuth();
  const isNew = !initial.id;
  const [staff, setStaff] = useState([]);
  const [customer, setCustomer] = useState(initial.customer_id ? { id: initial.customer_id, full_name: initial.customer_name, phone: initial.customer_phone } : null);
  const [f, setF] = useState({
    kind: initial.kind || 'tamir', item_desc: initial.item_desc || '', karat: initial.karat || '', gram_in: initial.gram_in ?? '', issue: initial.issue || '',
    estimated_price: initial.estimated_price ?? '', deposit: '', deposit_account: 'kasa', due_date: initial.due_date || '',
    assigned_staff_id: initial.assigned_staff_id ? String(initial.assigned_staff_id) : '', photo: initial.photo || null, note: initial.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));

  useEffect(() => {
    if (can('staff')) api.get(A('/staff')).then((s) => setStaff(s.filter((x) => x.active))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { path } = await api.upload(A('/uploads'), file);
      setF((s) => ({ ...s, photo: path }));
      toast('Fotoğraf yüklendi');
    } catch (e) { toast(e); } finally { setUploading(false); }
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = {
        kind: f.kind, customer_id: customer?.id ?? null, item_desc: f.item_desc.trim(), karat: f.karat || null, gram_in: toNum(f.gram_in) ?? null,
        issue: f.issue.trim() || null, estimated_price: toNum(f.estimated_price) ?? 0, due_date: f.due_date || null,
        assigned_staff_id: f.assigned_staff_id ? Number(f.assigned_staff_id) : (isNew ? null : initial.assigned_staff_id ?? null),
        photo: f.photo || null, note: f.note.trim() || null,
      };
      if (isNew) {
        const res = await api.post(A('/repairs'), { ...body, deposit: toNum(f.deposit) ?? 0, deposit_account: f.deposit_account });
        toast(`İş emri açıldı: ${res.no}`);
        onSaved(res.id);
      } else {
        await api.put(A(`/repairs/${initial.id}`), body);
        toast('İş emri güncellendi');
        onSaved(initial.id);
      }
    } catch (err) { toast(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Yeni iş emri' : `${initial.no} düzenle`} onClose={onClose} wide footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" onClick={save} disabled={busy || uploading || f.item_desc.trim().length < 2}>{isNew ? 'İş emrini aç' : 'Kaydet'}</button>
    </>}>
      <form className="stack" onSubmit={save}>
        <Select label="İşlem türü" value={f.kind} onChange={set('kind')} options={Object.entries(REPAIR_KIND)} />
        <FieldBox label="Müşteri"><CustomerPicker value={customer} onChange={setCustomer} /></FieldBox>
        <Input label="Ürün açıklaması" value={f.item_desc} onChange={set('item_desc')} placeholder="Örn. 22 ayar burma bilezik, kopuk" maxLength={200} required />
        <div className="grid c3">
          <Select label="Ayar" value={f.karat} onChange={set('karat')} options={[['', '—'], ...KARATS.map((k) => [k, `${k} ayar`])]} />
          <Input label="Giriş gramı" inputMode="decimal" value={f.gram_in} onChange={set('gram_in')} placeholder="0,00" />
          <Input label="Teslim tarihi" type="date" value={f.due_date} min={isNew ? today() : undefined} onChange={set('due_date')} />
        </div>
        <Textarea label="Sorun / müşteri isteği" value={f.issue} onChange={set('issue')} maxLength={1000} rows={3} />
        <div className="grid c3">
          <Input label="Tahmini ücret (₺)" inputMode="decimal" value={f.estimated_price} onChange={set('estimated_price')} placeholder="0" />
          {isNew && <Input label="Kapora (₺)" inputMode="decimal" value={f.deposit} onChange={set('deposit')} placeholder="0" />}
          {isNew && toNum(f.deposit) > 0 && <Select label="Kapora hesabı" value={f.deposit_account} onChange={set('deposit_account')} options={ACCOUNTS} />}
        </div>
        {!isNew && initial.deposit > 0 && <div className="xs muted">Alınan kapora: {money(initial.deposit)} (düzenlenemez)</div>}
        {can('staff') && staff.length > 0 && (
          <Select label="Usta" value={f.assigned_staff_id} onChange={set('assigned_staff_id')}>
            <option value="">— Atanmadı —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.position ? ` (${s.position})` : ''}</option>)}
          </Select>
        )}
        <FieldBox label="Fotoğraf" hint="ürünün teslim alındığı hali">
          <div className="row">
            {f.photo && <img className="gb-photo" src={f.photo} alt="" style={{ maxWidth: 120 }} />}
            <label className="btn">
              <Camera size={16} />{uploading ? 'Yükleniyor…' : f.photo ? 'Değiştir' : 'Fotoğraf çek / seç'}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {f.photo && <button type="button" className="btn ghost sm" onClick={() => setF((s) => ({ ...s, photo: null }))}>Kaldır</button>}
          </div>
        </FieldBox>
        <Textarea label="Not (iç kullanım)" value={f.note} onChange={set('note')} maxLength={1000} rows={2} />
      </form>
    </Modal>
  );
}
