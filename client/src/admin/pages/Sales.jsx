import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Receipt, Search } from 'lucide-react';
import { A } from '../../lib/api.js';
import { money, has, dateTime, today, daysAgo } from '../../lib/format.js';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Loading, Empty, ErrorBox, Badge, Stat, Seg } from '../../components/ui.jsx';
import { useDebounced } from './Pos.jsx';
import './grupB.css';

const monthStart = () => `${today().slice(0, 8)}01`;
const PRESETS = [
  ['Bugün', () => [today(), today()]],
  ['Dün', () => [daysAgo(1), daysAgo(1)]],
  ['Son 7 gün', () => [daysAgo(6), today()]],
  ['Bu ay', () => [monthStart(), today()]],
  ['Son 30 gün', () => [daysAgo(29), today()]],
];

export default function Sales() {
  usePageTitle('Satışlar');
  const { can, user } = useAuth();
  const nav = useNavigate();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q.trim(), 300);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (dq) p.set('q', dq);
    if (status) p.set('status', status);
    return A(`/sales?${p}`);
  }, [from, to, dq, status]);
  const { data, loading, error } = useApi(url);

  // İptal edilen satışlar toplamlara katılmaz
  const sum = useMemo(() => {
    const ok = (data || []).filter((s) => s.status === 'tamam');
    return {
      n: ok.length,
      total: ok.reduce((s, x) => s + x.total, 0),
      has: ok.reduce((s, x) => s + x.has_total, 0),
      credit: ok.reduce((s, x) => s + x.credit_total, 0),
      cancelled: (data || []).length - ok.length,
    };
  }, [data]);
  const activePreset = PRESETS.find(([, fn]) => { const [f, t] = fn(); return f === from && t === to; })?.[0];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card-pad stack" style={{ gap: 12 }}>
        <div className="gb-presets">
          {PRESETS.map(([label, fn]) => (
            <button key={label} type="button" className={`btn sm ${activePreset === label ? 'primary' : ''}`} onClick={() => { const [f, t] = fn(); setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <div className="gb-filters">
          <label className="field"><span>Başlangıç</span><input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Bitiş</span><input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="field"><span>Ara</span>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Satış no veya müşteri adı" />
          </label>
        </div>
        <div className="row between">
          <Seg value={status} onChange={setStatus} options={[['', 'Tümü'], ['tamam', 'Tamamlanan'], ['iptal', 'İptal']]} />
          {can('sales', 'w') && <Link to="/panel/satis" className="btn primary"><Plus size={16} />Yeni satış</Link>}
        </div>
        {user?.role === 'sales' && <div className="xs muted">Satış personeli yalnızca son 7 günün satışlarını görebilir.</div>}
      </div>

      <div className="grid c4">
        <Stat label="Satış adedi" value={sum.n} sub={sum.cancelled ? `${sum.cancelled} iptal` : 'iptal yok'} icon={Receipt} />
        <Stat label="Ciro" value={money(sum.total)} tone="gold" sub={sum.n ? `Ortalama ${money(sum.total / sum.n)}` : ' '} />
        <Stat label="Has karşılığı" value={has(sum.has)} />
        <Stat label="Veresiye" value={money(sum.credit)} sub="açık hesaba yazılan" />
      </div>

      <div className="card">
        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : !data?.length ? <Empty icon={Search}>Bu aralıkta satış yok</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Satış no</th><th>Tarih</th><th>Müşteri</th><th className="gb-hide-md">Personel</th>
                  <th className="right gb-hide-sm">Kalem</th><th className="right">Tutar</th><th className="right gb-hide-md">Veresiye</th><th className="gb-hide-sm">Durum</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className={`click ${s.status === 'iptal' ? 'gb-cancel' : ''}`} onClick={() => nav(`/panel/satislar/${s.id}`)}
                    tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/panel/satislar/${s.id}`)}>
                    <td className="nowrap"><b>{s.no}</b>{s.status === 'iptal' && <span className="mobile-only"> <Badge tone="red">İptal</Badge></span>}</td>
                    <td className="nowrap small">{dateTime(s.ts)}</td>
                    <td>{s.customer_name || <span className="muted">Perakende</span>}</td>
                    <td className="gb-hide-md small">{s.staff_name || s.user_name}</td>
                    <td className="right gb-hide-sm">{s.item_count}</td>
                    <td className="right nowrap num gb-amt"><b>{money(s.total)}</b></td>
                    <td className="right nowrap num gb-hide-md">{s.credit_total > 0 ? money(s.credit_total) : '—'}</td>
                    <td className="gb-hide-sm">{s.status === 'iptal' ? <Badge tone="red">İptal</Badge> : <Badge tone="green">Tamam</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
