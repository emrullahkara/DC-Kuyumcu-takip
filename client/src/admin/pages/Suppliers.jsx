import { useState } from 'react';
import { Plus, Truck, Pencil, Trash2, Phone, MessageCircle, Wallet } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { money, has, curAmount, dateTime, waLink, telLink } from '../../lib/format.js';
import { Modal, useToast, useConfirm, Input, Select, Textarea, Loading, Empty, ErrorBox, Stat } from '../../components/ui.jsx';
import './grupC.css';

const LEDGER_LABEL = { alis: 'Mal alışı', odeme: 'Ödeme', devir: 'Devir', duzeltme: 'Düzeltme', iade: 'İade' };

/** Tedarikçi bakiyesi: pozitif = biz tedarikçiye borçluyuz, negatif = tedarikçi bize borçlu */
function SupBalance({ value, cur = 'TRY', block }) {
  const v = Number(value) || 0;
  if (Math.abs(v) < (cur === 'HAS' ? 0.0009 : 0.009)) return <span className="muted">—</span>;
  return (
    <span className={v > 0 ? 'gc-debt' : 'gc-credit'}>
      {cur === 'HAS' ? has(Math.abs(v)) : curAmount(Math.abs(v), cur)}
      {block ? <span className="gc-bal-label">{v > 0 ? 'biz borçluyuz' : 'tedarikçi borçlu'}</span> : null}
    </span>
  );
}

export default function Suppliers() {
  usePageTitle('Tedarikçiler');
  const { can } = useAuth();
  const canW = can('suppliers', 'w');
  const { data, loading, error, reload } = useApi(A('/suppliers'));
  const [edit, setEdit] = useState(null);
  const [detail, setDetail] = useState(null);
  const rows = data || [];
  const debtHas = rows.reduce((s, r) => s + Math.max(0, r.balance_has), 0);
  const debtTry = rows.reduce((s, r) => s + Math.max(0, r.balance_try), 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid c3">
        <Stat tone="gold" label="Toptancılara has borcumuz" value={has(debtHas)} />
        <Stat label="TL borcumuz" value={money(debtTry, 0)} />
        <Stat label="Aktif tedarikçi" value={rows.length} />
      </div>
      <div className="page-actions" style={{ marginBottom: 0 }}>
        <span className="small muted grow">Bakiye: <b className="gc-debt">kırmızı = biz borçluyuz</b>, <b className="gc-credit">yeşil = tedarikçi bize borçlu</b>.</span>
        {canW && <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} />Yeni tedarikçi</button>}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !rows.length ? <div className="card"><Empty icon={Truck}>Tedarikçi yok</Empty></div> : (
        <>
          <div className="card gc-desktop">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tedarikçi</th><th>Yetkili</th><th>Telefon</th><th className="right">Has bakiye</th><th className="right">TL bakiye</th></tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="click" onClick={() => setDetail(s.id)}>
                      <td><b>{s.name}</b>{s.address && <div className="xs muted">{s.address}</div>}</td>
                      <td>{s.contact || '—'}</td>
                      <td className="nowrap">{s.phone || '—'}</td>
                      <td className="right num nowrap"><SupBalance value={s.balance_has} cur="HAS" block /></td>
                      <td className="right num nowrap"><SupBalance value={s.balance_try} block /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="gc-mobile gc-list">
            {rows.map((s) => (
              <div key={s.id} className="gc-item" role="button" tabIndex={0} onClick={() => setDetail(s.id)} onKeyDown={(e) => e.key === 'Enter' && setDetail(s.id)}>
                <div className="gc-main">
                  <div className="gc-title">{s.name}</div>
                  <div className="gc-meta">{s.contact && <span>{s.contact}</span>}{s.phone && <span>{s.phone}</span>}</div>
                </div>
                <div className="gc-side small">
                  {Math.abs(s.balance_has) >= 0.001 && <SupBalance value={s.balance_has} cur="HAS" block />}
                  {Math.abs(s.balance_try) >= 0.01 && <SupBalance value={s.balance_try} block />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {edit && <SupplierForm sup={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {detail && <SupplierDetail id={detail} onClose={() => setDetail(null)} onChanged={reload} onEdit={(s) => { setDetail(null); setEdit(s); }} />}
    </div>
  );
}

function SupplierForm({ sup, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ name: sup?.name || '', contact: sup?.contact || '', phone: sup?.phone || '', address: sup?.address || '', notes: sup?.notes || '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { ...f, phone: f.phone.trim() || null };
    try {
      if (sup) await api.put(A(`/suppliers/${sup.id}`), body); else await api.post(A('/suppliers'), body);
      toast('Tedarikçi kaydedildi'); onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={sup ? 'Tedarikçiyi düzenle' : 'Yeni tedarikçi'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" form="gc-sup-form" disabled={busy}>Kaydet</button>
    </>}>
      <form id="gc-sup-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <Input label="Firma adı" required minLength={2} maxLength={120} value={f.name} onChange={set('name')} autoFocus placeholder="ör. Kapalıçarşı toptancı" />
        <div className="grid c2">
          <Input label="Yetkili kişi" value={f.contact} onChange={set('contact')} />
          <Input label="Telefon" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
        </div>
        <Input label="Adres" value={f.address} onChange={set('address')} maxLength={300} />
        <Textarea label="Notlar" value={f.notes} onChange={set('notes')} maxLength={1000} />
      </form>
    </Modal>
  );
}

function SupplierDetail({ id, onClose, onChanged, onEdit }) {
  const { can } = useAuth();
  const canW = can('suppliers', 'w');
  const toast = useToast();
  const confirm = useConfirm();
  const { data: s, loading, error, reload } = useApi(A(`/suppliers/${id}`));
  const [paying, setPaying] = useState(false);

  const deactivate = async () => {
    if (!(await confirm(`"${s.name}" pasife alınsın mı? Listeden kalkar; geçmiş hareketler korunur.`, { danger: true, ok: 'Pasife al' }))) return;
    try { await api.del(A(`/suppliers/${id}`)); toast('Tedarikçi pasife alındı'); onChanged(); onClose(); } catch (err) { toast(err); }
  };

  const b = s?.balances || {};
  return (<>
    <Modal wide title={s ? s.name : 'Tedarikçi'} onClose={onClose} footer={s && canW && <>
      <button className="btn danger" onClick={deactivate}><Trash2 size={16} />Pasife al</button>
      <button className="btn" onClick={() => onEdit(s)}><Pencil size={16} />Düzenle</button>
      <button className="btn primary" onClick={() => setPaying(true)}><Wallet size={16} />Ödeme yap</button>
    </>}>
      <ErrorBox error={error} />
      {loading && !s ? <Loading /> : s && (
        <div className="stack">
          <div className="row">
            <span className="grow small muted">{[s.contact, s.phone, s.address].filter(Boolean).join(' · ') || 'İletişim bilgisi yok'}</span>
            {s.phone && <a className="btn sm" href={telLink(s.phone)}><Phone size={15} />Ara</a>}
            {s.phone && <a className="btn sm" href={waLink(s.phone)} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a>}
          </div>
          <div className="grid c2" style={{ gap: 10 }}>
            {['HAS', 'TRY', 'USD', 'EUR'].filter((k) => k === 'HAS' || k === 'TRY' || b[k]).map((k) => (
              <div key={k} className="card card-pad" style={{ padding: 12, background: 'var(--surface-2)' }}>
                <div className="xs muted">{k === 'HAS' ? 'Has altın' : k === 'TRY' ? 'Türk lirası' : k}</div>
                <div style={{ fontSize: 19 }} className="num"><SupBalance value={b[k]} cur={k} block /></div>
              </div>
            ))}
          </div>
          {s.notes && <div className="alert info" style={{ whiteSpace: 'pre-wrap' }}>{s.notes}</div>}

          <div className="gc-section">
            <h4>Cari hareketler</h4>
            {!s.ledger.length ? <Empty>Hareket yok</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Tarih</th><th>İşlem</th><th className="right">Borcumuz (+)</th><th className="right">Ödenen (−)</th><th>Not</th></tr></thead>
                  <tbody>
                    {s.ledger.map((l) => (
                      <tr key={l.id}>
                        <td className="small nowrap">{dateTime(l.ts)}</td>
                        <td>{LEDGER_LABEL[l.type] || l.type}</td>
                        <td className="right num nowrap gc-debt">{l.amount > 0 ? curAmount(l.amount, l.currency) : ''}</td>
                        <td className="right num nowrap gc-credit">{l.amount < 0 ? curAmount(-l.amount, l.currency) : ''}</td>
                        <td className="small">{l.note || '—'}{l.user_name && <span className="muted"> · {l.user_name}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="gc-section">
            <h4>Bu tedarikçinin ürünleri ({s.products.length})</h4>
            {!s.products.length ? <Empty>Bağlı ürün yok</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Stok kodu</th><th>Ürün</th><th className="right">Stok</th></tr></thead>
                  <tbody>{s.products.map((p) => <tr key={p.id}><td className="small muted">{p.sku}</td><td>{p.name}</td><td className="right num">{p.stock_qty}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
    {paying && s && <PaymentModal sup={s} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); reload(); onChanged(); }} />}
  </>);
}

function PaymentModal({ sup, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ currency: sup.balances?.HAS > 0 ? 'HAS' : 'TRY', amount: '', account: 'kasa', note: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const due = sup.balances?.[f.currency] || 0;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post(A(`/suppliers/${sup.id}/payment`), { currency: f.currency, amount: parseFloat(String(f.amount).replace(',', '.')), account: f.account, note: f.note || null });
      toast('Ödeme kaydedildi; kasadan çıkış yazıldı'); onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Ödeme — ${sup.name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" form="gc-pay-form" disabled={busy || !f.amount}>Ödemeyi kaydet</button>
    </>}>
      <form id="gc-pay-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <div className="grid c2">
          <Select label="Ne ile ödeniyor" value={f.currency} onChange={set('currency')} options={[['HAS', 'Has altın (gram)'], ['TRY', 'Türk lirası'], ['USD', 'Dolar'], ['EUR', 'Euro']]} />
          <Input label={f.currency === 'HAS' ? 'Miktar (gr has)' : 'Tutar'} required inputMode="decimal" value={f.amount} onChange={set('amount')} autoFocus />
        </div>
        {due > 0 && (
          <div className="small">Kalan borcumuz: <b>{curAmount(due, f.currency)}</b>{' '}
            <button type="button" className="btn sm ghost" onClick={() => setF((s) => ({ ...s, amount: String(due) }))}>Tamamını öde</button>
          </div>
        )}
        {f.currency === 'TRY' && <Select label="Hesap" value={f.account} onChange={set('account')} options={[['kasa', 'Kasa'], ['banka', 'Banka']]} />}
        <Textarea label="Açıklama" value={f.note} onChange={set('note')} maxLength={300} style={{ minHeight: 60 }} />
      </form>
    </Modal>
  );
}
