import { useState } from 'react';
import { UserPlus, KeyRound, LogOut, Pencil, Copy } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { dateTime } from '../../lib/format.js';
import { Card, Modal, Input, Select, Check, Badge, Loading, ErrorBox, useToast, useConfirm } from '../../components/ui.jsx';

function UserModal({ user, roles, staff, onClose, onSaved }) {
  const [f, setF] = useState(user ? { ...user, active: !!user.active } : { username: '', full_name: '', role: 'sales', staff_id: '', active: true });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { full_name: f.full_name, role: f.role, staff_id: f.staff_id ? Number(f.staff_id) : null };
      if (user) { await api.put(A(`/users/${user.id}`), { ...body, active: f.active }); onSaved(); }
      else { const r = await api.post(A('/users'), { ...body, username: f.username }); onSaved(r.temp_password, f.username); }
    } catch (err) { setError(err); }
  };
  return (
    <Modal title={user ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn primary" form="user-form">Kaydet</button></>}>
      <form id="user-form" className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        {!user && <Input label="Kullanıcı adı" hint="küçük harf, rakam, . _ -" required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} autoCapitalize="none" />}
        <Input label="Ad Soyad" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <Select label="Rol" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={Object.entries(roles)} />
        <Select label="Bağlı personel kaydı" hint="mesai ve satış performansı için" value={f.staff_id || ''} onChange={(e) => setF({ ...f, staff_id: e.target.value })}
          options={[['', '— Yok —'], ...staff.map((s) => [s.id, s.full_name])]} />
        {user && <Check label="Hesap aktif" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />}
        {!user && <div className="alert info">Geçici bir parola üretilecek; kullanıcı ilk girişte kendi parolasını belirlemek zorunda kalır.</div>}
      </form>
    </Modal>
  );
}

export default function Users() {
  usePageTitle('Kullanıcılar & Yetkiler');
  const { can, user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi(A('/users'));
  const staff = useApi(can('staff') ? A('/staff') : null).data || [];
  const [edit, setEdit] = useState(null);
  const [temp, setTemp] = useState(null);
  const w = can('users', 'w');

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const reset = async (u) => {
    if (!(await confirm(`${u.full_name} için parola sıfırlansın mı? Tüm oturumları kapanır.`, { ok: 'Sıfırla', danger: true }))) return;
    const withMfa = u.totp_enabled && (await confirm('İki adımlı doğrulama da sıfırlansın mı? (Telefonunu kaybettiyse)', { ok: 'Evet, 2FA da sıfırlansın' }));
    try {
      const r = await api.post(A(`/users/${u.id}/reset`), { reset_2fa: !!withMfa });
      setTemp({ username: u.username, password: r.temp_password });
      reload();
    } catch (err) { toast(err); }
  };
  const revoke = async (u) => {
    await api.post(A(`/users/${u.id}/revoke`));
    toast('Oturumlar kapatıldı'); reload();
  };

  return (
    <div className="stack">
      <div className="page-actions">
        <div className="grow muted small">Her çalışanın kendi hesabı olmalı; ortak parola kullanmayın. Tüm işlemler kullanıcı adıyla denetim kaydına yazılır.</div>
        {w && <button className="btn primary" onClick={() => setEdit({})}><UserPlus size={17} />Yeni kullanıcı</button>}
      </div>
      <Card pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Kullanıcı</th><th>Rol</th><th>2FA</th><th>Durum</th><th>Son giriş</th><th /></tr></thead>
          <tbody>{data.users.map((u) => (
            <tr key={u.id}>
              <td><b>{u.full_name}</b><div className="xs muted">@{u.username}{u.staff_name ? ` · ${u.staff_name}` : ''}</div></td>
              <td><Badge tone={u.role === 'owner' ? 'gold' : ''}>{data.roles[u.role]}</Badge></td>
              <td>{u.totp_enabled ? <Badge tone="green">Açık</Badge> : <Badge tone="amber">Kapalı</Badge>}</td>
              <td>{!u.active ? <Badge tone="red">Pasif</Badge> : u.locked_until && new Date(u.locked_until) > new Date() ? <Badge tone="red">Kilitli</Badge> : u.must_change_password ? <Badge tone="blue">Parola bekliyor</Badge> : <Badge tone="green">Aktif</Badge>}
                {u.session_count > 0 && <div className="xs muted">{u.session_count} açık oturum</div>}</td>
              <td className="small">{dateTime(u.last_login_at)}</td>
              <td className="right nowrap">{w && u.id !== me.id && (<>
                <button className="btn sm ghost" title="Düzenle" onClick={() => setEdit(u)}><Pencil size={15} /></button>
                <button className="btn sm ghost" title="Parola sıfırla" onClick={() => reset(u)}><KeyRound size={15} /></button>
                <button className="btn sm ghost" title="Oturumları kapat" onClick={() => revoke(u)}><LogOut size={15} /></button>
              </>)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      <Card title="Rol yetki tablosu" pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Modül</th>{Object.values(data.roles).map((r) => <th key={r} className="center">{r}</th>)}</tr></thead>
          <tbody>{Object.entries(data.modules).map(([m, label]) => (
            <tr key={m}><td>{label}</td>{Object.keys(data.roles).map((r) => {
              const p = data.matrix[r][m];
              return <td key={r} className="center">{p === 'w' ? <Badge tone="green">Tam</Badge> : p === 'r' ? <Badge tone="blue">Görür</Badge> : <span className="muted">—</span>}</td>;
            })}</tr>
          ))}</tbody>
        </table></div>
      </Card>
      {edit && <UserModal user={edit.id ? edit : null} roles={data.roles} staff={staff} onClose={() => setEdit(null)}
        onSaved={(pw, username) => { setEdit(null); reload(); if (pw) setTemp({ username, password: pw }); else toast('Kaydedildi'); }} />}
      {temp && (
        <Modal title="Geçici parola" onClose={() => setTemp(null)} footer={<button className="btn primary" onClick={() => setTemp(null)}>Tamam, not aldım</button>}>
          <p>Bu parolayı kullanıcıya <b>yüz yüze</b> iletin. Bir daha gösterilmeyecek; ilk girişte değiştirmesi istenecek.</p>
          <div className="card card-pad row between">
            <div><div className="xs muted">Kullanıcı adı</div><b>{temp.username}</b><div className="xs muted mt-s">Parola</div><b className="num" style={{ fontFamily: 'monospace', fontSize: 20 }}>{temp.password}</b></div>
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(temp.password); toast('Kopyalandı'); }}><Copy size={15} />Kopyala</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
