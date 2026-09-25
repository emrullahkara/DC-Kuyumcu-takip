import { useState } from 'react';
import { Plus, UserCog, Pencil, Phone, Clock, Wallet, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { money, date, dateTime, today, telLink, ACCOUNT_LABEL } from '../../lib/format.js';
import { Modal, useToast, Input, Select, Textarea, Check, Seg, Loading, Empty, ErrorBox, Badge, Stat } from '../../components/ui.jsx';
import './grupC.css';

const TR_LABEL = { maas: 'Maaş ödemesi', avans: 'Avans', prim: 'Ek prim', kesinti: 'Kesinti' };
const thisMonth = () => today().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mo] = m.split('-').map(Number); const x = new Date(y, mo - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const monthName = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
/** "09:05"–"18:40" arası süre (saat) */
const hours = (a, b) => { if (!a || !b) return null; const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60; };

export default function Staff() {
  usePageTitle('Personel');
  const { can } = useAuth();
  const canW = can('staff', 'w');
  const { data, loading, error, reload } = useApi(A('/staff'));
  const [edit, setEdit] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showPassive, setShowPassive] = useState(false);
  const all = data || [];
  const rows = showPassive ? all : all.filter((s) => s.active);
  const active = all.filter((s) => s.active);
  const inShop = active.filter((s) => s.today_in && !s.today_out).length;
  const monthSales = active.reduce((a, s) => a + (s.month_sales || 0), 0);
  const payroll = active.reduce((a, s) => a + (s.salary || 0), 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid c3">
        <Stat tone="gold" icon={Clock} label="Şu an dükkânda" value={`${inShop} / ${active.length}`} sub="bugün giriş yapıp çıkmayanlar" />
        <Stat label="Bu ay personel satışı" value={money(monthSales, 0)} />
        <Stat label="Aylık maaş yükü" value={money(payroll, 0)} sub="prim hariç" />
      </div>
      <div className="page-actions" style={{ marginBottom: 0 }}>
        <Check label="Ayrılanları da göster" checked={showPassive} onChange={(e) => setShowPassive(e.target.checked)} />
        <span className="grow" />
        {canW && <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} />Yeni personel</button>}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !rows.length ? <div className="card"><Empty icon={UserCog}>Personel kaydı yok</Empty></div> : (
        <>
          <div className="card gc-desktop">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Personel</th><th>Görev</th><th>Bugün</th><th className="right">Bu ay satış</th><th className="right">Maaş / prim</th><th>Kullanıcı</th></tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="click" onClick={() => setDetail(s.id)}>
                      <td><b>{s.full_name}</b>{!s.active && <> <Badge tone="red">Ayrıldı</Badge></>}<div className="xs muted">{s.phone || ''}</div></td>
                      <td>{s.position || '—'}</td>
                      <td><Today s={s} /></td>
                      <td className="right num nowrap">{money(s.month_sales, 0)}<div className="xs muted">{s.month_sale_count} satış</div></td>
                      <td className="right num nowrap">{money(s.salary, 0)}<div className="xs muted">%{s.commission_pct} prim</div></td>
                      <td>{s.username ? <Badge tone="blue">{s.username}</Badge> : <span className="xs muted">bağlı değil</span>}</td>
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
                  <div className="gc-title">{s.full_name}{!s.active && ' (ayrıldı)'}</div>
                  <div className="gc-meta"><span>{s.position || 'Görev yok'}</span><Today s={s} /></div>
                </div>
                <div className="gc-side small"><b>{money(s.month_sales, 0)}</b><span className="muted">bu ay</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      {edit && <StaffForm staff={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {detail && <StaffDetail id={detail} onClose={() => setDetail(null)} onChanged={reload} onEdit={(s) => { setDetail(null); setEdit(s); }} />}
    </div>
  );
}

function Today({ s }) {
  if (!s.today_in) return <Badge>Gelmedi</Badge>;
  if (!s.today_out) return <Badge tone="green">İçeride · {s.today_in}</Badge>;
  return <Badge>{s.today_in}–{s.today_out}</Badge>;
}

function StaffForm({ staff, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    full_name: staff?.full_name || '', phone: staff?.phone || '', position: staff?.position || '', tckn: '', iban: '',
    start_date: staff?.start_date || '', salary: staff ? String(staff.salary ?? '') : '', commission_pct: staff ? String(staff.commission_pct ?? '') : '',
    active: staff ? !!staff.active : true, notes: staff?.notes || '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const num = (v) => parseFloat(String(v).replace(',', '.')) || 0;
    // TC ve IBAN boş bırakılırsa sunucu mevcut (şifreli) değeri korur
    const body = {
      full_name: f.full_name, phone: f.phone.trim() || null, position: f.position || null, tckn: f.tckn || null,
      iban: f.iban ? f.iban.replace(/\s/g, '').toUpperCase() : null, start_date: f.start_date || '', salary: num(f.salary), commission_pct: num(f.commission_pct),
      active: f.active, notes: f.notes || null,
    };
    try {
      if (staff) await api.put(A(`/staff/${staff.id}`), body); else await api.post(A('/staff'), body);
      toast('Personel kaydedildi'); onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal wide title={staff ? `Personeli düzenle — ${staff.full_name}` : 'Yeni personel'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" form="gc-staff-form" disabled={busy}>Kaydet</button>
    </>}>
      <form id="gc-staff-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <div className="grid c2">
          <Input label="Ad soyad" required minLength={2} value={f.full_name} onChange={set('full_name')} autoFocus />
          <Input label="Telefon" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
        </div>
        <div className="grid c2">
          <Input label="Görev" value={f.position} onChange={set('position')} placeholder="ör. Tezgâhtar, Usta, Kasiyer" />
          <Input label="İşe başlama" type="date" value={f.start_date} onChange={set('start_date')} />
        </div>
        <div className="grid c2">
          <Input label="TC kimlik no" hint={staff?.tckn_masked ? `kayıtlı: ${staff.tckn_masked}; boş = değişmez` : 'şifreli saklanır'} inputMode="numeric" maxLength={11}
            value={f.tckn} onChange={(e) => setF((s) => ({ ...s, tckn: e.target.value.replace(/\D/g, '') }))} />
          <Input label="IBAN" hint={staff ? 'boş = kayıtlı IBAN korunur' : 'TR ile başlar'} value={f.iban} maxLength={32} placeholder="TR00 0000 0000 0000 0000 0000 00"
            onChange={set('iban')} />
        </div>
        <div className="grid c2">
          <Input label="Aylık net maaş (₺)" inputMode="decimal" value={f.salary} onChange={set('salary')} />
          <Input label="Satış primi (%)" hint="aylık satış cirosu üzerinden" inputMode="decimal" value={f.commission_pct} onChange={set('commission_pct')} />
        </div>
        <Textarea label="Not" value={f.notes} onChange={set('notes')} maxLength={1000} style={{ minHeight: 60 }} />
        <Check label="Aktif çalışıyor" checked={f.active} onChange={set('active')} />
      </form>
    </Modal>
  );
}

function StaffDetail({ id, onClose, onChanged, onEdit }) {
  const { can } = useAuth();
  const canW = can('staff', 'w');
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const { data: s, loading, error, reload } = useApi(A(`/staff/${id}?month=${month}`));
  const [txOpen, setTxOpen] = useState(false);
  const [att, setAtt] = useState(null); // düzenlenen mesai satırı
  const [tab, setTab] = useState('payroll');

  const saveAtt = async () => {
    try {
      await api.put(A(`/staff/${id}/attendance`), { date: att.date, check_in: att.check_in || null, check_out: att.check_out || null, note: att.note || null });
      toast('Mesai kaydı güncellendi'); setAtt(null); reload(); onChanged();
    } catch (err) { toast(err); }
  };

  const p = s?.payroll;
  const totalHours = (s?.attendance || []).reduce((a, r) => a + (hours(r.check_in, r.check_out) || 0), 0);
  return (<>
    <Modal wide title={s ? s.full_name : 'Personel'} onClose={onClose} footer={s && canW && <>
      <button className="btn" onClick={() => onEdit(s)}><Pencil size={16} />Düzenle</button>
      <button className="btn primary" onClick={() => setTxOpen(true)}><Wallet size={16} />Ödeme / avans / kesinti</button>
    </>}>
      <ErrorBox error={error} />
      {loading && !s ? <Loading /> : s && (
        <div className="stack">
          <div className="row">
            <span className="grow small muted">{[s.position, s.start_date && `${date(s.start_date)} başladı`, s.tckn_masked && `TC ${s.tckn_masked}`].filter(Boolean).join(' · ')}</span>
            {s.phone && <a className="btn sm" href={telLink(s.phone)}><Phone size={15} />Ara</a>}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn icon sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Önceki ay"><ChevronLeft size={16} /></button>
            <b style={{ minWidth: 140, textAlign: 'center', textTransform: 'capitalize' }}>{monthName(month)}</b>
            <button className="btn icon sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Sonraki ay"><ChevronRight size={16} /></button>
          </div>
          <div className="grid c3" style={{ gap: 10 }}>
            <Stat label="Satış" value={money(s.sales.total, 0)} sub={`${s.sales.n} fiş`} />
            <Stat label="Brüt kâr" value={money(s.sales.gross, 0)} />
            <Stat tone="gold" label="Net kalan hak ediş" value={money(p.net_due)} />
          </div>

          <div className="tabs" style={{ marginBottom: 0 }}>
            {[['payroll', 'Bordro'], ['attendance', `Mesai (${s.attendance.length})`], ['tx', 'Hareketler']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'payroll' && (
            <dl className="gc-payroll">
              <dt>Maaş</dt><dd>{money(p.salary)}</dd>
              <dt>Satış primi (%{s.commission_pct} × {money(s.sales.total, 0)})</dt><dd>+ {money(p.commission)}</dd>
              <dt>Ek prim</dt><dd>+ {money(p.bonuses)}</dd>
              <dt>Avans</dt><dd>− {money(p.advances)}</dd>
              <dt>Kesinti</dt><dd>− {money(p.deductions)}</dd>
              <dt>Bu dönem ödenen maaş</dt><dd>− {money(p.paid_salary)}</dd>
              <dt className="total"><b>Net kalan</b></dt><dd className="total" style={{ color: p.net_due < 0 ? 'var(--danger)' : 'var(--primary-strong)' }}>{money(p.net_due)}</dd>
            </dl>
          )}

          {tab === 'attendance' && (
            <div className="stack">
              <div className="row small muted">
                <span className="grow">Toplam {totalHours.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} saat · {s.attendance.length} gün</span>
                {canW && <button className="btn sm" onClick={() => setAtt({ date: today(), check_in: '', check_out: '', note: '' })}><Plus size={14} />Gün ekle</button>}
              </div>
              {att && canW && (
                <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <Input label="Tarih" type="date" value={att.date} onChange={(e) => setAtt({ ...att, date: e.target.value })} />
                    <Input label="Giriş" type="time" value={att.check_in || ''} onChange={(e) => setAtt({ ...att, check_in: e.target.value })} />
                    <Input label="Çıkış" type="time" value={att.check_out || ''} onChange={(e) => setAtt({ ...att, check_out: e.target.value })} />
                    <Input label="Not" value={att.note || ''} onChange={(e) => setAtt({ ...att, note: e.target.value })} />
                    <button className="btn primary" onClick={saveAtt}><Save size={15} />Kaydet</button>
                    <button className="btn ghost" onClick={() => setAtt(null)}>Vazgeç</button>
                  </div>
                </div>
              )}
              {!s.attendance.length ? <Empty>Bu ay mesai kaydı yok</Empty> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Tarih</th><th>Giriş</th><th>Çıkış</th><th className="right">Süre</th><th>Not</th>{canW && <th />}</tr></thead>
                    <tbody>
                      {s.attendance.map((r) => {
                        const h = hours(r.check_in, r.check_out);
                        return (
                          <tr key={r.id}>
                            <td className="nowrap">{new Date(`${r.date}T12:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short' })}</td>
                            <td className="num">{r.check_in || '—'}</td>
                            <td className="num">{r.check_out || <span className="muted">—</span>}</td>
                            <td className="right num">{h !== null ? `${h.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa` : '—'}</td>
                            <td className="small">{r.note || ''}</td>
                            {canW && <td className="right"><button className="btn sm ghost icon" onClick={() => setAtt({ ...r })} aria-label="Düzelt"><Pencil size={14} /></button></td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'tx' && (!s.transactions.length ? <Empty>Hareket yok</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Tarih</th><th>Tür</th><th>Dönem</th><th className="right">Tutar</th><th>Not</th></tr></thead>
                <tbody>
                  {s.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="small nowrap">{dateTime(t.ts)}</td>
                      <td><Badge tone={t.type === 'kesinti' ? 'red' : t.type === 'avans' ? 'amber' : t.type === 'prim' ? 'green' : 'blue'}>{TR_LABEL[t.type]}</Badge></td>
                      <td className="small">{t.period}</td>
                      <td className="right num">{money(t.amount)}</td>
                      <td className="small">{t.note || ''}{t.user_name && <span className="muted"> · {t.user_name}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Modal>
    {txOpen && s && <TxModal staff={s} month={month} onClose={() => setTxOpen(false)} onSaved={() => { setTxOpen(false); reload(); }} />}
  </>);
}

function TxModal({ staff, month, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ type: 'avans', amount: '', period: month, account: 'kasa', note: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const HELP = {
    maas: 'Maaş ödemesi: kasadan/bankadan çıkış yazılır, net kalandan düşer.',
    avans: 'Avans: kasadan/bankadan çıkış yazılır, ay sonu hak edişten düşer.',
    prim: 'Ek prim: ödenir ve kasadan/bankadan çıkış yazılır.',
    kesinti: 'Kesinti: para hareketi olmaz; yalnızca hak edişten düşer.',
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post(A(`/staff/${staff.id}/transactions`), { type: f.type, amount: parseFloat(String(f.amount).replace(',', '.')), period: f.period, account: f.account, note: f.note || null });
      toast(`${TR_LABEL[f.type]} kaydedildi`); onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title={`İşlem — ${staff.full_name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" form="gc-tx-form" disabled={busy || !f.amount}>Kaydet</button>
    </>}>
      <form id="gc-tx-form" className="stack" onSubmit={save}>
        <ErrorBox error={error} />
        <Seg value={f.type} onChange={set('type')} options={[['maas', 'Maaş'], ['avans', 'Avans'], ['prim', 'Ek prim'], ['kesinti', 'Kesinti']]} />
        <div className="xs muted">{HELP[f.type]}</div>
        <div className="grid c2">
          <Input label="Tutar (₺)" required inputMode="decimal" value={f.amount} onChange={set('amount')} autoFocus />
          <Input label="Dönem" type="month" required value={f.period} onChange={set('period')} />
        </div>
        {f.type === 'maas' && staff.payroll.net_due > 0 && (
          <div className="small">Net kalan: <b>{money(staff.payroll.net_due)}</b>{' '}
            <button type="button" className="btn sm ghost" onClick={() => setF((s) => ({ ...s, amount: String(staff.payroll.net_due) }))}>Tamamını öde</button>
          </div>
        )}
        {f.type !== 'kesinti' && <Select label="Ödeme hesabı" value={f.account} onChange={set('account')} options={[['kasa', ACCOUNT_LABEL.kasa], ['banka', ACCOUNT_LABEL.banka]]} />}
        <Textarea label="Açıklama" value={f.note} onChange={set('note')} maxLength={300} style={{ minHeight: 60 }} />
      </form>
    </Modal>
  );
}
