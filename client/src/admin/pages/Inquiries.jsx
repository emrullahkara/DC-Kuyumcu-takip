import { Phone, CheckCheck, RotateCcw } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { dateTime, waLink, telLink } from '../../lib/format.js';
import { Card, Loading, ErrorBox, Badge, Empty, useToast } from '../../components/ui.jsx';
import { MessageSquare } from 'lucide-react';

const STATUS = { yeni: ['Yeni', 'gold'], arandi: ['Arandı', 'blue'], kapandi: ['Kapandı', ''] };

export default function Inquiries() {
  usePageTitle('Web Talepleri');
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(A('/inquiries'));
  const w = can('inquiries', 'w');
  const setStatus = async (r, status) => {
    try { await api.put(A(`/inquiries/${r.id}`), { status }); reload(); } catch (err) { toast(err); }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data.length) return <Empty icon={MessageSquare}>Web sitenizden henüz talep gelmedi.</Empty>;
  return (
    <div className="stack">
      <div className="small muted">Web sitenizdeki “Beni arayın” ve “Bu ürünü sor” formlarından gelen talepler. Müşteriyi aradıktan sonra durumunu işaretleyin.</div>
      {data.map((r) => (
        <Card key={r.id}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 220 }}>
              <div className="row"><b>{r.name}</b><Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge><span className="xs muted">{dateTime(r.ts)}</span></div>
              <div className="small mt-s">{r.phone}</div>
              {r.product_name && <div className="small">İlgilendiği ürün: <b>{r.product_name}</b></div>}
              {r.message && <p className="small" style={{ margin: '8px 0 0', whiteSpace: 'pre-line' }}>{r.message}</p>}
            </div>
            <div className="row">
              <a className="btn sm" href={telLink(r.phone)}><Phone size={15} />Ara</a>
              <a className="btn sm" href={waLink(r.phone, `Merhaba ${r.name}, web sitemizden ilettiğiniz talep için yazıyoruz.`)} target="_blank" rel="noreferrer noopener">WhatsApp</a>
              {w && r.status === 'yeni' && <button className="btn sm primary" onClick={() => setStatus(r, 'arandi')}><CheckCheck size={15} />Arandı</button>}
              {w && r.status === 'arandi' && <button className="btn sm" onClick={() => setStatus(r, 'kapandi')}>Kapat</button>}
              {w && r.status !== 'yeni' && <button className="btn sm ghost" title="Yeniye al" onClick={() => setStatus(r, 'yeni')}><RotateCcw size={15} /></button>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
