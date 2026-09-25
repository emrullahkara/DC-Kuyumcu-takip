import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, CheckCircle2 } from 'lucide-react';

/** "Bu ürünü sor / Beni arayın" formu — KVKK onayı ve bot tuzağı içerir */
export default function InquiryForm({ productId, placeholder = 'Mesajınız (ör. yüzük ölçüsü, bütçe, istediğiniz model)' }) {
  const [f, setF] = useState({ name: '', phone: '', message: '', website: '', consent: false });
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: false, error: null });
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, product_id: productId || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Gönderilemedi');
      setState({ busy: false, done: true, error: null });
    } catch (err) {
      setState({ busy: false, done: false, error: err.message });
    }
  };
  if (state.done) {
    return <div className="alert ok"><CheckCircle2 size={20} />Talebiniz alındı. En kısa sürede sizi arayacağız. Teşekkür ederiz!</div>;
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid c2">
        <label className="field"><span>Adınız Soyadınız</span><input className="input" required minLength={2} maxLength={80} value={f.name} onChange={set('name')} autoComplete="name" /></label>
        <label className="field"><span>Telefon</span><input className="input" required type="tel" inputMode="tel" maxLength={20} placeholder="05xx xxx xx xx" value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>
      </div>
      <label className="field"><span>Mesajınız</span><textarea className="textarea" maxLength={1000} placeholder={placeholder} value={f.message} onChange={set('message')} /></label>
      {/* Bot tuzağı: insanlar görmez */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true" />
      <label className="check small"><input type="checkbox" required checked={f.consent} onChange={set('consent')} />
        <span><Link to="/kvkk" target="_blank">KVKK Aydınlatma Metni</Link>'ni okudum; iletişim amacıyla bilgilerimin işlenmesini kabul ediyorum.</span></label>
      {state.error && <div className="alert error">{state.error}</div>}
      <button className="btn dark lg" disabled={state.busy}><Send size={17} />{state.busy ? 'Gönderiliyor…' : 'Beni arayın'}</button>
    </form>
  );
}
