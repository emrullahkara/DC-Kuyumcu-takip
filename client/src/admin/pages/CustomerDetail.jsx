import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Phone, MessageCircle, Pencil, Wallet, Printer, UserX, Eye, ShieldCheck } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { money, has, curAmount, date, dateTime, today, waLink, telLink, ACCOUNT_LABEL, REPAIR_STATUS, REPAIR_KIND } from '../../lib/format.js';
import { Modal, useToast, useConfirm, Input, Select, Textarea, Seg, Loading, Empty, ErrorBox, Badge, Card } from '../../components/ui.jsx';
import { Balance, CustomerForm } from './Customers.jsx';
import './grupC.css';

const LEDGER_LABEL = {
  veresiye: 'Veresiye satış', tahsilat: 'Tahsilat', odeme: 'Ödeme (bizden)', emanet: 'Emanet', duzeltme: 'Düzeltme', iptal: 'İptal', alis: 'Alış', devir: 'Devir',
};
const PURCHASE_KIND = { hurda: 'Hurda / bozdurma', urun: 'Ürün alışı', sarrafiye: 'Sarrafiye', doviz: 'Döviz' };
const CURS = ['TRY', 'HAS', 'USD', 'EUR'];

/** Yazdırma: yalnızca .gc-print alanı kâğıda çıkar */
function printArea() {
  document.body.classList.add('gc-printing');
  const done = () => { document.body.classList.remove('gc-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

export default function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, user } = useAuth();
  const canW = can('customers', 'w');
  const elevated = ['owner', 'manager'].includes(user?.role);
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, loading, error, reload } = useApi(A(`/customers/${id}`));
  usePageTitle(c ? c.full_name : 'Müşteri');
  const [tab, setTab] = useState('ledger');
  const [editing, setEditing] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [statement, setStatement] = useState(false);
  const [tckn, setTckn] = useState(null);

  const showTc = async () => {
    try { const r = await api.get(A(`/customers/${id}/tckn`)); setTckn(r.tckn); toast('TC görüntülendi — bu işlem denetim kaydına işlendi'); } catch (err) { toast(err); }
  };
  const anonymize = async () => {
    const ok = await confirm('Müşterinin adı, telefonu, TC, adres ve notları kalıcı olarak silinecek; mali kayıtlar "Anonim Müşteri" olarak korunacak. Bu işlem geri alınamaz. Devam edilsin mi?', { danger: true, ok: 'Anonimleştir', title: 'KVKK — unutulma hakkı' });
    if (!ok) return;
    try { await api.post(A(`/customers/${id}/anonymize`)); toast('Müşteri anonimleştirildi'); reload(); } catch (err) { toast(err); }
  };

  if (loading && !c) return <Loading />;
  if (error) return <div className="stack"><Link to="/panel/musteriler" className="btn sm" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={15} />Müşteriler</Link><ErrorBox error={error} /></div>;
  if (!c) return null;
  const b = c.balances || {};
  const locked = !!c.anonymized;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-actions" style={{ marginBottom: 0 }}>
        <button className="btn sm ghost" onClick={() => nav('/panel/musteriler')}><ArrowLeft size={15} />Müşteriler</button>
        <span className="grow" />
        {c.phone && !locked && <>
          <a className="btn" href={telLink(c.phone)}><Phone size={16} />Ara</a>
          <a className="btn" href={waLink(c.phone)} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>
        </>}
        <button className="btn" onClick={() => setStatement(true)}><Printer size={16} />Ekstre</button>
        {canW && !locked && <button className="btn" onClick={() => setEditing(true)}><Pencil size={16} />Düzenle</button>}
        {canW && !locked && <button className="btn primary" onClick={() => setLedgerOpen(true)}><Wallet size={16} />Cari işlem</button>}
      </div>

      {locked && <div className="alert warn">Bu müşteri KVKK kapsamında anonimleştirilmiştir. Mali kayıtlar yalnızca raporlama için korunur.</div>}

      <div className="grid c2">
        <Card title="Kişi bilgileri">
          <dl className="kv">
            <dt>Ad soyad</dt><dd>{c.full_name}</dd>
            <dt>Telefon</dt><dd>{c.phone || '—'}</dd>
            {c.email && <><dt>E-posta</dt><dd>{c.email}</dd></>}
            <dt>TC kimlik no</dt>
            <dd>
              {tckn ? <span className="num">{tckn} <Badge tone="amber">kayda geçti</Badge></span> : c.tckn_masked || <span className="muted">Kayıtlı değil</span>}
              {c.tckn_masked && !tckn && elevated && canW && (
                <button className="btn sm ghost" onClick={showTc} style={{ marginLeft: 6 }} title="Görüntüleme denetim kaydına işlenir"><Eye size={14} />TC'yi göster</button>
              )}
            </dd>
            {c.birth_date && <><dt>Doğum günü</dt><dd>{date(c.birth_date)}</dd></>}
            {c.anniversary_date && <><dt>Evlilik yıldönümü</dt><dd>{date(c.anniversary_date)}</dd></>}
            {c.address && <><dt>Adres</dt><dd>{c.address}</dd></>}
            {c.tags && <><dt>Etiketler</dt><dd className="row" style={{ gap: 4 }}>{c.tags.split(',').filter(Boolean).map((t) => <Badge key={t} tone="gold">{t.trim()}</Badge>)}</dd></>}
            {c.notes && <><dt>Not</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</dd></>}
            <dt>KVKK</dt>
            <dd className="row" style={{ gap: 6 }}>
              {c.kvkk_consent ? <Badge tone="green"><ShieldCheck size={12} />Açık rıza {c.kvkk_consent_at ? date(c.kvkk_consent_at) : ''}</Badge> : <Badge tone="red">Açık rıza yok</Badge>}
              {c.marketing_consent ? <Badge tone="blue">Ticari ileti izni</Badge> : <Badge>İleti izni yok</Badge>}
            </dd>
            <dt>Kayıt</dt><dd>{date(c.created_at)}</dd>
          </dl>
          {canW && elevated && !locked && (
            <div className="row end mt"><button className="btn sm danger" onClick={anonymize}><UserX size={15} />KVKK anonimleştir</button></div>
          )}
        </Card>

        <Card title="Cari bakiye">
          <div className="stack">
            <div className="grid c2" style={{ gap: 10 }}>
              {CURS.filter((k) => k === 'TRY' || k === 'HAS' || b[k]).map((k) => (
                <div key={k} className="card card-pad" style={{ padding: 12, background: 'var(--surface-2)' }}>
                  <div className="xs muted">{k === 'TRY' ? 'Türk lirası' : k === 'HAS' ? 'Altın (has gram)' : k}</div>
                  <div style={{ fontSize: 19 }} className="num">
                    {k === 'TRY' || k === 'HAS' ? <Balance value={b[k]} cur={k} block /> : <span className={b[k] > 0 ? 'gc-debt' : 'gc-credit'}>{curAmount(Math.abs(b[k]), k)}<span className="gc-bal-label">{b[k] > 0 ? 'müşteri borçlu' : 'biz borçluyuz'}</span></span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="xs muted">Pozitif bakiye müşterinin bize borcunu, negatif bakiye (emanet, alacak) bizim müşteriye borcumuzu gösterir.</div>
            <div className="row small muted" style={{ gap: 16 }}>
              <span>{c.sales.length} satış</span><span>{c.purchases.length} alış</span><span>{c.repairs.length} tamir/sipariş</span>
            </div>
          </div>
        </Card>
      </div>

      <section className="card">
        <div className="tabs" style={{ padding: '0 12px', marginBottom: 0 }}>
          {[['ledger', `Cari hareketler (${c.ledger.length})`], ['sales', `Satışlar (${c.sales.length})`], ['purchases', `Alışlar (${c.purchases.length})`], ['repairs', `Tamirler (${c.repairs.length})`]].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === 'ledger' && <LedgerTable rows={c.ledger} />}
        {tab === 'sales' && (!c.sales.length ? <Empty>Satış yok</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Fiş</th><th>Tarih</th><th className="right">Tutar</th><th>Durum</th></tr></thead>
            <tbody>{c.sales.map((s) => (
              <tr key={s.id} className="click" onClick={() => nav(`/panel/satislar/${s.id}`)}>
                <td><Link to={`/panel/satislar/${s.id}`} onClick={(e) => e.stopPropagation()}><b>{s.no}</b></Link></td>
                <td className="small nowrap">{dateTime(s.ts)}</td>
                <td className="right num">{money(s.total)}</td>
                <td>{s.status === 'tamam' ? <Badge tone="green">Tamamlandı</Badge> : s.status === 'iptal' ? <Badge tone="red">İptal</Badge> : <Badge>{s.status}</Badge>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
        {tab === 'purchases' && (!c.purchases.length ? <Empty>Alış yok</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Fiş</th><th>Tarih</th><th>Tür</th><th className="right">Has</th><th className="right">Tutar</th></tr></thead>
            <tbody>{c.purchases.map((p) => (
              <tr key={p.id}>
                <td><b>{p.no}</b></td><td className="small nowrap">{dateTime(p.ts)}</td><td>{PURCHASE_KIND[p.kind] || p.kind}</td>
                <td className="right num nowrap">{p.has_total ? has(p.has_total) : '—'}</td><td className="right num">{money(p.total)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
        {tab === 'repairs' && (!c.repairs.length ? <Empty>Tamir / sipariş yok</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>No</th><th>İş</th><th>Açıklama</th><th>Durum</th><th>Teslim</th></tr></thead>
            <tbody>{c.repairs.map((r) => {
              const [lbl, tone] = REPAIR_STATUS[r.status] || [r.status, ''];
              return (
                <tr key={r.id} className="click" onClick={() => nav('/panel/tamir')}>
                  <td><b>{r.no}</b></td><td>{REPAIR_KIND[r.kind] || r.kind}</td><td className="small">{r.item_desc}</td>
                  <td><Badge tone={tone}>{lbl}</Badge></td><td className="small nowrap">{date(r.due_date)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ))}
      </section>

      {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {ledgerOpen && <LedgerModal customer={c} elevated={elevated} onClose={() => setLedgerOpen(false)} onSaved={() => { setLedgerOpen(false); reload(); }} />}
      {statement && <StatementModal c={c} onClose={() => setStatement(false)} />}
    </div>
  );
}

function LedgerTable({ rows }) {
  if (!rows.length) return <Empty>Cari hareket yok</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Tarih</th><th>İşlem</th><th className="right">Borç (+)</th><th className="right">Alacak (−)</th><th>Not</th><th className="gc-desktop">Kullanıcı</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td className="small nowrap">{dateTime(l.ts)}</td>
              <td>{LEDGER_LABEL[l.type] || l.type}{l.ref_type === 'sale' && l.ref_id ? <> · <Link to={`/panel/satislar/${l.ref_id}`} className="small">fiş</Link></> : null}</td>
              <td className="right num nowrap gc-debt">{l.amount > 0 ? curAmount(l.amount, l.currency) : ''}</td>
              <td className="right num nowrap gc-credit">{l.amount < 0 ? curAmount(-l.amount, l.currency) : ''}</td>
              <td className="small">{l.note || '—'}</td>
              <td className="small muted gc-desktop">{l.user_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tahsilat / ödeme / emanet / düzeltme */
function LedgerModal({ customer, elevated, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ type: 'tahsilat', currency: 'TRY', amount: '', account: 'kasa', direction: 'borc', note: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const HELP = {
    tahsilat: 'Müşteri borcunu öder: bakiye azalır, kasaya giriş yazılır.',
    odeme: 'Müşteriye olan borcumuzu öderiz: kasadan çıkış yazılır.',
    emanet: 'Müşteri bize altın/para bırakır: kasaya girer, müşteriye borçlanırız.',
    duzeltme: 'Yalnızca cari bakiyeyi düzeltir; kasaya hareket yazılmaz (patron/müdür).',
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { type: f.type, currency: f.currency, amount: parseFloat(String(f.amount).replace(',', '.')), account: f.account, note: f.note || null };
    if (f.type === 'duzeltme') body.direction = f.direction;
    try { await api.post(A(`/customers/${customer.id}/ledger`), body); toast('Cari işlem kaydedildi'); onSaved(); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const types = [['tahsilat', 'Tahsilat'], ['odeme', 'Ödeme'], ['emanet', 'Emanet'], ...(elevated ? [['duzeltme', 'Düzeltme']] : [])];
  return (
    <Modal title={`Cari işlem — ${customer.full_name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" form="gc-ledger-form" disabled={busy || !f.amount}>Kaydet</button>
    </>}>
      <form id="gc-ledger-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <Seg value={f.type} onChange={set('type')} options={types} />
        <div className="xs muted">{HELP[f.type]}</div>
        <div className="grid c2">
          <Select label="Para birimi" value={f.currency} onChange={set('currency')} options={[['TRY', 'Türk lirası (₺)'], ['HAS', 'Has altın (gram)'], ['USD', 'Dolar ($)'], ['EUR', 'Euro (€)']]} />
          <Input label={f.currency === 'HAS' ? 'Miktar (gr has)' : 'Tutar'} required inputMode="decimal" value={f.amount} onChange={set('amount')} autoFocus />
        </div>
        {f.type !== 'duzeltme' && f.type !== 'emanet' && f.currency === 'TRY' && (
          <Select label="Hesap" value={f.account} onChange={set('account')} options={Object.entries(ACCOUNT_LABEL)} />
        )}
        {f.type === 'duzeltme' && (
          <Select label="Yön" value={f.direction} onChange={set('direction')} options={[['borc', 'Müşteriyi borçlandır (+)'], ['alacak', 'Müşteriyi alacaklandır (−)']]} />
        )}
        <Textarea label="Açıklama" value={f.note} onChange={set('note')} maxLength={300} style={{ minHeight: 60 }} />
        <div className="small muted">Mevcut bakiye: <Balance value={customer.balances?.TRY} /> · <Balance value={customer.balances?.HAS} cur="HAS" /></div>
      </form>
    </Modal>
  );
}

/** Yazdırılabilir cari ekstre: kronolojik, her para birimi için yürüyen bakiye */
function StatementModal({ c, onClose }) {
  const { site } = useAuth();
  const curs = useMemo(() => {
    const set = new Set(['TRY', 'HAS']);
    c.ledger.forEach((l) => set.add(l.currency));
    return CURS.filter((k) => set.has(k));
  }, [c]);
  // Liste en yeniden eskiye gelir; güncel bakiyeden geriye doğru yürüyerek her satırdaki bakiye bulunur
  const rows = useMemo(() => {
    const run = Object.fromEntries(curs.map((k) => [k, c.balances?.[k] || 0]));
    const out = c.ledger.map((l) => {
      const after = { ...run };
      run[l.currency] -= l.amount;
      return { ...l, after };
    });
    return out.reverse();
  }, [c, curs]);
  return (
    <Modal wide title="Cari hesap ekstresi" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Kapat</button>
      <button className="btn primary" onClick={printArea}><Printer size={16} />Yazdır</button>
    </>}>
      <div className="gc-print gc-statement stack">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div><h2>{site || 'Kuyumcu'}</h2><div className="small muted">Cari hesap ekstresi</div></div>
          <div className="small right">Tarih: {date(today())}<br />Müşteri no: {c.id}</div>
        </div>
        <div className="small"><b>{c.full_name}</b>{c.phone ? ` · ${c.phone}` : ''}{c.tckn_masked ? ` · TC ${c.tckn_masked}` : ''}</div>
        {!rows.length ? <Empty>Hareket yok</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th className="right">Tutar</th>{curs.map((k) => <th key={k} className="right">Bakiye {k === 'TRY' ? '₺' : k === 'HAS' ? 'has' : k}</th>)}</tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap">{date(l.ts)}</td>
                    <td>{LEDGER_LABEL[l.type] || l.type}</td>
                    <td>{l.note || ''}</td>
                    <td className="right num nowrap">{l.amount > 0 ? '+' : '−'}{curAmount(Math.abs(l.amount), l.currency)}</td>
                    {curs.map((k) => <td key={k} className="right num nowrap">{k === 'HAS' ? has(l.after[k]) : k === 'TRY' ? money(l.after[k]) : curAmount(l.after[k], k)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="small">
          <b>Güncel bakiye:</b>{' '}
          {curs.map((k) => {
            const v = c.balances?.[k] || 0;
            return <span key={k} style={{ marginRight: 12 }}>{curAmount(Math.abs(v), k)} {Math.abs(v) < 0.001 ? '' : v > 0 ? '(müşteri borçlu)' : '(müşteri alacaklı)'}</span>;
          })}
        </div>
        <div className="xs muted">Pozitif tutar müşteriyi borçlandırır, negatif tutar alacaklandırır. Bu ekstre bilgi amaçlıdır.</div>
      </div>
    </Modal>
  );
}
