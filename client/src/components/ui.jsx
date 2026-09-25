import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Inbox, AlertTriangle } from 'lucide-react';

// ---------- Bildirimler ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
/** toast('Kaydedildi') / toast(err, 'error') */
export const useToast = () => {
  const push = useContext(ToastCtx);
  return useCallback((m, type) => push(m instanceof Error ? m.message : m, m instanceof Error ? 'error' : type), [push]);
};

// ---------- Modal ----------
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn ghost icon sm" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Onay penceresi: const ok = await confirm('Emin misiniz?') */
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((message, opts = {}) => new Promise((resolve) => setState({ message, opts, resolve })), []);
  const close = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.opts.title || 'Onay'} onClose={() => close(false)} footer={<>
          <button className="btn" onClick={() => close(false)}>Vazgeç</button>
          <button className={`btn ${state.opts.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>{state.opts.ok || 'Evet'}</button>
        </>}>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {state.opts.danger && <AlertTriangle color="var(--danger)" style={{ flex: 'none' }} />}
            <p style={{ margin: 0 }}>{state.message}</p>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------- Form alanları ----------
export function Field({ label, hint, children, style }) {
  return (
    <label className="field" style={style}>
      {label && <span>{label}{hint && <span className="hint"> — {hint}</span>}</span>}
      {children}
    </label>
  );
}
export function Input({ label, hint, ...p }) {
  return <Field label={label} hint={hint}><input className="input" {...p} /></Field>;
}
export function Select({ label, hint, options, children, ...p }) {
  return (
    <Field label={label} hint={hint}>
      <select className="select" {...p}>
        {options ? options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)) : children}
      </select>
    </Field>
  );
}
export function Textarea({ label, hint, ...p }) {
  return <Field label={label} hint={hint}><textarea className="textarea" {...p} /></Field>;
}
export function Check({ label, ...p }) {
  return <label className="check"><input type="checkbox" {...p} />{label}</label>;
}
export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([v, l]) => <button type="button" key={v} className={value === v ? 'on' : ''} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

// ---------- Göstergeler ----------
export const Loading = () => <div className="loading"><div className="spinner" aria-label="Yükleniyor" /></div>;
export function Empty({ children = 'Kayıt bulunamadı', icon: Icon = Inbox }) {
  return <div className="empty"><Icon size={36} /><div>{children}</div></div>;
}
export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert error"><AlertTriangle size={18} />{error.message || String(error)}</div>;
}
export const Badge = ({ tone = '', children }) => <span className={`badge ${tone}`}>{children}</span>;
export function Stat({ label, value, sub, icon: Icon, tone }) {
  return (
    <div className={`card stat ${tone || ''}`}>
      <div className="label">{Icon && <Icon size={15} />}{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
export function Card({ title, actions, children, pad = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="card-head"><h3>{title}</h3>{actions && <div className="row">{actions}</div>}</div>}
      {pad ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

/** Form durumu yardımcı kancası */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((s) => ({ ...s, [k]: v }));
  };
  return { values, set, setValues, bind: (k) => ({ value: values[k] ?? '', onChange: set(k) }) };
}
