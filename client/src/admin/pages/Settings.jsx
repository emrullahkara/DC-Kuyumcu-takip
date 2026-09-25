import { useEffect, useState } from 'react';
import { Download, Save, ShieldCheck } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { Card, Input, Textarea, Check, Loading, ErrorBox, useToast } from '../../components/ui.jsx';

const ROLES = [['owner', 'Patron'], ['manager', 'Müdür'], ['sales', 'Satış Personeli'], ['accountant', 'Muhasebe'], ['workshop', 'Atölye Ustası']];

export default function Settings() {
  usePageTitle('İşletme Ayarları');
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const owner = user.role === 'owner';
  useEffect(() => { api.get(A('/settings')).then(setF).catch(setError); }, []);
  if (error && !f) return <ErrorBox error={error} />;
  if (!f) return <Loading />;

  const toggle = (key, role) => setF({ ...f, [key]: f[key].includes(role) ? f[key].filter((r) => r !== role) : [...f[key], role] });
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try { await api.put(A('/settings'), f); toast('Ayarlar kaydedildi'); } catch (err) { setError(err); }
  };
  const backup = async () => {
    const res = await api.raw(A('/backup'));
    if (!res.ok) return toast('Yedek alınamadı', 'error');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kuyumcu-yedek-${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Yedek indirildi — güvenli bir yerde saklayın');
  };

  return (
    <form className="grid c2" style={{ alignItems: 'start' }} onSubmit={save}>
      <div className="stack">
        {!owner && <div className="alert info">Ayarları yalnızca patron değiştirebilir; siz görüntülüyorsunuz.</div>}
        <ErrorBox error={error} />
        <Card title="Satış kuralları">
          <div className="stack">
            <Input label="Kimlik tespiti eşiği (₺)" hint="MASAK — bu tutar ve üzeri işlemde TC zorunlu" type="number" min={0} disabled={!owner}
              value={f.identity_threshold_try} onChange={(e) => setF({ ...f, identity_threshold_try: Number(e.target.value) })} />
            <div className="alert warn small">Eşik tutarı mevzuatla güncellenir; güncel tutarı mali müşavirinizden teyit edin.</div>
            <Input label="Satış personeli en fazla indirim (%)" type="number" step="0.5" min={0} max={50} disabled={!owner}
              value={f.max_discount_pct_sales} onChange={(e) => setF({ ...f, max_discount_pct_sales: Number(e.target.value) })} />
            <Input label="Etiket fiyatı yuvarlama (₺)" hint="ör. 5 → 12.342 ₺ yerine 12.345 ₺" type="number" min={1} max={100} disabled={!owner}
              value={f.price_rounding} onChange={(e) => setF({ ...f, price_rounding: Number(e.target.value) })} />
            <Input label="Hurda alımında varsayılan fire (%)" type="number" step="0.1" min={0} max={20} disabled={!owner}
              value={f.default_fire_pct} onChange={(e) => setF({ ...f, default_fire_pct: Number(e.target.value) })} />
            <Textarea label="Fiş alt notu" disabled={!owner} value={f.receipt_footer || ''} onChange={(e) => setF({ ...f, receipt_footer: e.target.value })} />
          </div>
        </Card>
      </div>
      <div className="stack">
        <Card title={<span className="row"><ShieldCheck size={17} />Güvenlik politikası</span>}>
          <div className="stack">
            <div><b className="small">İki adımlı doğrulama zorunlu roller</b>
              <div className="row mt-s">{ROLES.map(([r, l]) => <Check key={r} label={l} disabled={!owner} checked={f.require_2fa_roles.includes(r)} onChange={() => toggle('require_2fa_roles', r)} />)}</div>
              <div className="xs muted mt-s">Seçilen roller, 2FA kurmadan hiçbir ekrana erişemez. En azından Patron ve Müdür için önerilir.</div>
            </div>
            <div><b className="small">Satış iptal edebilecek roller</b>
              <div className="row mt-s">{ROLES.filter(([r]) => r !== 'workshop').map(([r, l]) => <Check key={r} label={l} disabled={!owner} checked={f.cancel_roles.includes(r)} onChange={() => toggle('cancel_roles', r)} />)}</div>
            </div>
          </div>
        </Card>
        <Card title="Yedekleme">
          <p className="small muted">Tüm veritabanının anlık yedeğini indirir. Hassas alanlar (TC no, 2FA anahtarları) yedekte de şifrelidir; şifreleme anahtarlarını ayrıca ve güvenli saklayın. Haftada en az bir kez yedek alıp harici bir diskte saklamanız önerilir.</p>
          <button type="button" className="btn" disabled={!owner} onClick={backup}><Download size={16} />Yedeği indir</button>
        </Card>
        {owner && <div className="row end"><button className="btn primary lg"><Save size={18} />Kaydet</button></div>}
      </div>
    </form>
  );
}
