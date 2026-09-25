import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, TrendingUp, Smartphone, KeyRound } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Input, ErrorBox } from '../../components/ui.jsx';

export default function Login() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={loc.state?.from || '/panel'} replace />;

  const done = async (res) => {
    await refresh();
    nav(res.mustChangePassword || res.mfaSetupRequired ? '/panel/profil' : loc.state?.from || '/panel', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (challenge) {
        await done(await api.post('/api/auth/login/mfa', { challenge, code: code.trim() }));
      } else {
        const res = await api.post('/api/auth/login', form);
        if (res.mfa) setChallenge(res.challenge); else await done(res);
      }
    } catch (err) {
      setError(err);
      if (challenge && err.status === 401 && /süresi/.test(err.message)) setChallenge(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-root">
      <div className="login-wrap">
        <div className="login-art">
          <div className="row" style={{ gap: 12 }}>
            <span className="brand-mark">DC</span>
            <div><b style={{ fontSize: 17 }}>DC Kuyumcu Takip</b><div className="small" style={{ color: '#8b93a7' }}>Kuyumcular için işletme yönetimi</div></div>
          </div>
          <div>
            <h2>Dükkânınız cebinizde, altınınız güvende.</h2>
            <ul>
              <li><TrendingUp size={18} color="var(--gold-300)" />Anlık has altın ve döviz kuru, otomatik makas</li>
              <li><Smartphone size={18} color="var(--gold-300)" />Telefona kurulur; satış, stok ve kasa her an elinizde</li>
              <li><ShieldCheck size={18} color="var(--gold-300)" />İki adımlı doğrulama, şifreli müşteri verisi, değiştirilemez işlem kaydı</li>
            </ul>
          </div>
          <div className="small" style={{ color: '#6f7890' }}>Tüm bağlantılar şifrelidir. Her giriş ve işlem kayıt altındadır.</div>
        </div>
        <div className="login-form">
          <form className="box stack" onSubmit={submit} autoComplete="on">
            <div>
              <h2 style={{ fontSize: 26, margin: 0 }}>{challenge ? 'İki adımlı doğrulama' : 'Panele giriş'}</h2>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                {challenge ? 'Doğrulama uygulamanızdaki 6 haneli kodu girin.' : 'Kullanıcı adınız ve parolanızla giriş yapın.'}
              </p>
            </div>
            {loc.state?.expired && !error && <div className="alert info">Oturumunuzun süresi doldu, lütfen tekrar giriş yapın.</div>}
            <ErrorBox error={error} />
            {!challenge ? (
              <>
                <Input label="Kullanıcı adı" name="username" autoComplete="username" autoCapitalize="none" required autoFocus
                  value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                <Input label="Parola" name="password" type="password" autoComplete="current-password" required
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </>
            ) : (
              <Input label="Doğrulama kodu" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required autoFocus
                className="input lg" style={{ letterSpacing: '.4em', textAlign: 'center' }} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            )}
            <button className="btn primary lg block" disabled={busy}>
              {challenge ? <KeyRound size={18} /> : <Lock size={18} />}{busy ? 'Kontrol ediliyor…' : challenge ? 'Doğrula' : 'Giriş yap'}
            </button>
            {challenge && <button type="button" className="btn ghost" onClick={() => { setChallenge(null); setCode(''); }}>Geri dön</button>}
            <a href="/" className="small muted center">← Web sitesine dön</a>
          </form>
        </div>
      </div>
    </div>
  );
}
