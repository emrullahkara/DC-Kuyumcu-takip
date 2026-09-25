import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Search } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { dateTime } from '../../lib/format.js';
import { Card, Loading, ErrorBox, Badge, Empty } from '../../components/ui.jsx';

const LABELS = {
  'login.ok': ['Giriş', 'green'], 'login.fail': ['Hatalı giriş', 'red'], 'login.lock': ['Hesap kilitlendi', 'red'], 'login.locked': ['Kilitli hesaba deneme', 'red'],
  'login.mfa_fail': ['Hatalı 2FA kodu', 'red'], logout: ['Çıkış', ''], 'sale.create': ['Satış', 'gold'], 'sale.cancel': ['Satış iptali', 'red'],
  'purchase.create': ['Alış', 'gold'], 'customer.tckn_view': ['TC görüntüleme', 'amber'], 'customer.anonymize': ['KVKK anonimleştirme', 'amber'],
  'price.update': ['Fiyat/makas değişikliği', 'blue'], 'settings.update': ['Ayar değişikliği', 'amber'], 'backup.download': ['Yedek indirildi', 'amber'],
  'user.create': ['Kullanıcı eklendi', 'blue'], 'user.reset_password': ['Parola sıfırlandı', 'amber'], 'stock.move': ['Stok hareketi', 'blue'],
  'cash.day_close': ['Gün sonu', 'blue'], 'cash.movement': ['Kasa hareketi', 'blue'], 'user.2fa_enable': ['2FA açıldı', 'green'], 'user.2fa_disable': ['2FA kapatıldı', 'red'],
};

export default function Audit() {
  usePageTitle('Denetim Kaydı');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error } = useApi(A(`/audit?limit=500${query ? `&q=${encodeURIComponent(query)}` : ''}`));
  const [verify, setVerify] = useState(null);

  const check = async () => setVerify(await api.get(A('/audit/verify')));

  return (
    <div className="stack">
      <Card>
        <div className="row between">
          <div className="grow" style={{ minWidth: 240 }}>
            <b>Değiştirilemez işlem kaydı</b>
            <div className="small muted">Her giriş, satış, iptal, fiyat ve ayar değişikliği kim-ne zaman-hangi IP bilgisiyle kaydedilir. Kayıtlar birbirine kriptografik olarak zincirlidir; silinemez ve değiştirilemez.</div>
          </div>
          <button className="btn" onClick={check}><ShieldCheck size={16} />Bütünlüğü doğrula</button>
        </div>
        {verify && (verify.ok
          ? <div className="alert ok mt"><ShieldCheck size={18} />Zincir sağlam: {verify.checked} kayıt doğrulandı, hiçbir kayıtla oynanmamış.</div>
          : <div className="alert error mt"><ShieldAlert size={18} />DİKKAT: #{verify.brokenAt} numaralı kayıtta bozulma tespit edildi. Veritabanına dışarıdan müdahale edilmiş olabilir.</div>)}
      </Card>
      <form className="page-actions" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <div className="grow" style={{ position: 'relative' }}>
          <Search size={17} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
          <input className="input" style={{ paddingLeft: 38 }} placeholder="İşlem, kayıt veya ayrıntıda ara (ör. sale, iptal, patron)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn">Ara</button>
      </form>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data.length ? <Empty /> : (
        <Card pad={false}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th><th>Kayıt</th><th>Ayrıntı</th><th>IP</th></tr></thead>
            <tbody>{data.map((r) => {
              const [label, tone] = LABELS[r.action] || [r.action, ''];
              return (
                <tr key={r.id}>
                  <td className="small nowrap">{dateTime(r.ts)}</td>
                  <td className="small">{r.username || '—'}</td>
                  <td><Badge tone={tone}>{label}</Badge></td>
                  <td className="small">{r.entity ? `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ''}` : '—'}</td>
                  <td className="xs muted" style={{ maxWidth: 360, wordBreak: 'break-word' }}>{r.detail ? r.detail.slice(0, 220) : ''}</td>
                  <td className="xs num">{r.ip}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
      )}
    </div>
  );
}
