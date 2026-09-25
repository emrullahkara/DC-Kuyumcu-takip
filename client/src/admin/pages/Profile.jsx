import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, ShieldAlert, KeyRound, MonitorSmartphone, LogIn, LogOut as LogOutIcon } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../../lib/api.js';
import { dateTime, time } from '../../lib/format.js';
import { Card, Input, ErrorBox, Badge, useToast, Loading } from '../../components/ui.jsx';

function PasswordCard({ forced }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (f.next !== f.again) return setError(new Error('Yeni parolalar eşleşmiyor'));
    try {
      await api.post('/api/auth/password', { current: f.current, next: f.next });
      toast('Parolanız değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.');
      setF({ current: '', next: '', again: '' });
      await refresh();
    } catch (err) { setError(err); }
  };
  return (
    <Card title={<span className="row"><KeyRound size={17} />Parola değiştir</span>}>
      {forced && <div className="alert warn mb">Güvenliğiniz için devam etmeden önce geçici parolanızı değiştirmelisiniz.</div>}
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <Input label="Mevcut parola" type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        <Input label="Yeni parola" hint="en az 10 karakter, harf ve rakam" type="password" autoComplete="new-password" required minLength={10} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        <Input label="Yeni parola (tekrar)" type="password" autoComplete="new-password" required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} />
        <div><button className="btn primary">Parolayı güncelle</button></div>
      </form>
    </Card>
  );
}

function TwoFactorCard({ user, forced }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState(null);

  const start = async () => {
    setError(null);
    try {
      const s = await api.post('/api/auth/2fa/setup');
      setSetup(s);
      setQr(await QRCode.toDataURL(s.otpauth, { margin: 1, width: 220 }));
    } catch (err) { setError(err); }
  };
  const enable = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/2fa/enable', { code });
      toast('İki adımlı doğrulama açıldı');
      setSetup(null); setCode('');
      await refresh();
    } catch (err) { setError(err); }
  };
  const disable = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/2fa/disable', { password: pw, code });
      toast('İki adımlı doğrulama kapatıldı');
      setPw(''); setCode('');
      await refresh();
    } catch (err) { setError(err); }
  };

  return (
    <Card title={<span className="row"><ShieldCheck size={17} />İki adımlı doğrulama (2FA)</span>}
      actions={user.totp_enabled ? <Badge tone="green">Açık</Badge> : <Badge tone="amber">Kapalı</Badge>}>
      {forced && <div className="alert warn mb">Rolünüz için iki adımlı doğrulama zorunludur. Lütfen kurulumu tamamlayın.</div>}
      <ErrorBox error={error} />
      {!user.totp_enabled && !setup && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>Parolanız çalınsa bile hesabınıza girilemez: her girişte telefonunuzdaki
            Google Authenticator / Microsoft Authenticator uygulamasının ürettiği 6 haneli kod istenir. Değerli maden ticaretinde şiddetle önerilir.</p>
          <div><button className="btn primary" onClick={start}><ShieldCheck size={16} />Kurulumu başlat</button></div>
        </div>
      )}
      {setup && (
        <form className="stack" onSubmit={enable}>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Telefonunuza bir doğrulama uygulaması kurun.</li>
            <li>Uygulamada “QR kod tara” ile aşağıdaki kodu okutun.</li>
            <li>Uygulamanın gösterdiği 6 haneli kodu girin.</li>
          </ol>
          <div className="row">
            {qr && <img src={qr} alt="2FA QR kodu" width={180} height={180} style={{ borderRadius: 8, background: '#fff', padding: 6 }} />}
            <div className="small grow">QR okutamıyorsanız bu anahtarı elle girin:<div className="num" style={{ fontFamily: 'monospace', fontSize: 15, wordBreak: 'break-all', marginTop: 6 }}>{setup.secret}</div></div>
          </div>
          <Input label="Doğrulama kodu" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <div className="row"><button className="btn primary">Etkinleştir</button><button type="button" className="btn ghost" onClick={() => setSetup(null)}>Vazgeç</button></div>
        </form>
      )}
      {!!user.totp_enabled && (
        <form className="stack" onSubmit={disable}>
          <p className="muted small" style={{ margin: 0 }}>Kapatmak için parolanızı ve güncel kodu girin.</p>
          <div className="grid c2">
            <Input label="Parola" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} />
            <Input label="Kod" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div><button className="btn danger"><ShieldAlert size={16} />2FA'yı kapat</button></div>
        </form>
      )}
    </Card>
  );
}

function SessionsCard() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const load = () => api.get('/api/auth/sessions').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const revoke = async () => {
    await api.post('/api/auth/sessions/revoke-others');
    toast('Diğer cihazlardaki oturumlar kapatıldı');
    load();
  };
  return (
    <Card title={<span className="row"><MonitorSmartphone size={17} />Açık oturumlar</span>} actions={<button className="btn sm" onClick={revoke}>Diğerlerini kapat</button>} pad={false}>
      {!rows ? <Loading /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Cihaz</th><th>IP</th><th>Son etkinlik</th></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}>
              <td className="small">{(s.user_agent || '').replace(/\(.*?\)/, '').slice(0, 60) || '—'} {s.current && <Badge tone="gold">Bu cihaz</Badge>}</td>
              <td className="small num">{s.ip}</td>
              <td className="small">{dateTime(s.last_seen_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

function AttendanceCard({ user }) {
  const toast = useToast();
  const [today, setToday] = useState(null);
  const load = () => api.get('/api/admin/staff/me/today').then(setToday).catch(() => {});
  useEffect(() => { if (user.staff_id) load(); }, [user.staff_id]);
  if (!user.staff_id) return null;
  const check = async (action) => {
    try {
      const r = await api.post('/api/admin/staff/me/check', { action });
      toast(action === 'in' ? `Günaydın! Giriş: ${r.time}` : `İyi akşamlar! Çıkış: ${r.time}`);
      load();
    } catch (err) { toast(err); }
  };
  return (
    <Card title="Mesai">
      <div className="row between">
        <div className="small">Bugün giriş: <b>{today?.check_in || '—'}</b> · çıkış: <b>{today?.check_out || '—'}</b></div>
        <div className="row">
          <button className="btn primary" disabled={!!today?.check_in} onClick={() => check('in')}><LogIn size={16} />Giriş yap</button>
          <button className="btn" disabled={!today?.check_in || !!today?.check_out} onClick={() => check('out')}><LogOutIcon size={16} />Çıkış yap</button>
        </div>
      </div>
      <div className="xs muted mt-s">Saat: {time(new Date().toISOString())}</div>
    </Card>
  );
}

export default function Profile() {
  usePageTitle('Profilim & Güvenlik');
  const { user, flag } = useAuth();
  return (
    <div className="grid c2" style={{ alignItems: 'start' }}>
      <div className="stack">
        <Card title="Hesap">
          <dl className="kv">
            <dt>Ad Soyad</dt><dd>{user.full_name}</dd>
            <dt>Kullanıcı adı</dt><dd>{user.username}</dd>
            <dt>Rol</dt><dd><Badge tone="gold">{user.role_label}</Badge></dd>
            <dt>Son giriş</dt><dd>{dateTime(user.last_login_at)}</dd>
          </dl>
        </Card>
        <AttendanceCard user={user} />
        <PasswordCard forced={flag === 'MUST_CHANGE_PASSWORD' || !!user.must_change_password} />
      </div>
      <div className="stack">
        <TwoFactorCard user={user} forced={flag === 'MFA_SETUP_REQUIRED'} />
        <SessionsCard />
      </div>
    </div>
  );
}
