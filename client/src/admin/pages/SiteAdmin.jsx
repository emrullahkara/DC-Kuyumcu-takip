import { useEffect, useState } from 'react';
import { Save, Upload, Trash2, ExternalLink, Plus, X } from 'lucide-react';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { api, A } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Card, Input, Textarea, Select, Check, Loading, ErrorBox, useToast, useConfirm } from '../../components/ui.jsx';

const KINDS = [['logo', 'Logo'], ['hero', 'Ana sayfa arka planı'], ['about', 'Hakkımızda fotoğrafı'], ['gallery', 'Galeri']];

function ImageManager({ images, reload, canWrite }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState('gallery');
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { await api.upload(A('/site/images'), file, { kind }); toast('Görsel yüklendi'); reload(); } catch (err) { toast(err); }
    setBusy(false);
  };
  const remove = async (img) => {
    if (!(await confirm('Görsel silinsin mi?', { danger: true, ok: 'Sil' }))) return;
    await api.del(A(`/site/images/${img.id}`));
    reload();
  };
  return (
    <Card title="Görseller" actions={canWrite && (
      <div className="row">
        <select className="select" style={{ width: 'auto', minHeight: 34 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Görsel türü">
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="btn sm primary" style={{ cursor: 'pointer' }}><Upload size={15} />{busy ? 'Yükleniyor…' : 'Yükle'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} disabled={busy} /></label>
      </div>
    )}>
      <p className="xs muted" style={{ marginTop: 0 }}>JPG, PNG veya WEBP; en fazla 5 MB. Ürün fotoğrafları ürün kartından eklenir.</p>
      {KINDS.map(([k, l]) => {
        const list = images.filter((i) => i.kind === k);
        return (
          <div key={k} className="mb">
            <b className="small">{l}</b>
            {!list.length ? <div className="xs muted">Henüz yok{k === 'logo' ? ' — sitede işletme adının baş harfleri gösterilir' : ''}.</div> : (
              <div className="row mt-s">{list.map((img) => (
                <div key={img.id} style={{ position: 'relative' }}>
                  <img src={img.path} alt="" style={{ width: 110, height: 80, objectFit: k === 'logo' ? 'contain' : 'cover', borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }} />
                  {canWrite && <button type="button" className="btn sm icon danger" style={{ position: 'absolute', top: 4, right: 4, background: 'var(--surface)' }} onClick={() => remove(img)} aria-label="Sil"><Trash2 size={14} /></button>}
                </div>
              ))}</div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export default function SiteAdmin() {
  usePageTitle('Web Sitesi Yönetimi');
  const { can } = useAuth();
  const toast = useToast();
  const prices = useApi(A('/prices')).data?.items || [];
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const w = can('site', 'w');
  const load = () => api.get(A('/site')).then(setData).catch(setError);
  useEffect(() => { load(); }, []);
  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  const f = data.settings;
  const set = (k) => (e) => setData({ ...data, settings: { ...f, [k]: e?.target ? e.target.value : e } });
  const setList = (k, i, key) => (e) => setData({ ...data, settings: { ...f, [k]: f[k].map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)) } });

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.put(A('/site'), { ...f, founded_year: f.founded_year ? Number(f.founded_year) : null });
      toast('Site bilgileri kaydedildi');
    } catch (err) { setError(err); window.scrollTo(0, 0); }
  };

  return (
    <form onSubmit={save} className="stack">
      <div className="page-actions">
        <div className="grow small muted">Buradaki değişiklikler web sitenize anında yansır.</div>
        <a href="/" target="_blank" rel="noreferrer" className="btn"><ExternalLink size={16} />Siteyi aç</a>
        {w && <button className="btn primary"><Save size={16} />Kaydet</button>}
      </div>
      <ErrorBox error={error} />
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Firma bilgileri">
            <fieldset disabled={!w} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="grid c2">
                <Input label="Firma adı" required value={f.name || ''} onChange={set('name')} />
                <Input label="Kuruluş yılı" type="number" value={f.founded_year || ''} onChange={set('founded_year')} />
              </div>
              <Input label="Slogan" value={f.slogan || ''} onChange={set('slogan')} />
              <div className="grid c2">
                <Input label="Telefon" value={f.phone || ''} onChange={set('phone')} />
                <Input label="WhatsApp" hint="90 ile, boşluksuz" value={f.whatsapp || ''} onChange={(e) => set('whatsapp')(e.target.value.replace(/\D/g, ''))} />
                <Input label="E-posta" type="email" value={f.email || ''} onChange={set('email')} />
                <Input label="Instagram kullanıcı adı" value={f.instagram || ''} onChange={(e) => set('instagram')(e.target.value.replace('@', ''))} />
              </div>
              <Textarea label="Adres" value={f.address || ''} onChange={set('address')} style={{ minHeight: 60 }} />
              <Input label="Harita araması" hint="Google Haritalar'da aranacak adres" value={f.map_query || ''} onChange={set('map_query')} />
              <div>
                <b className="small">Çalışma saatleri</b>
                {(f.hours || []).map((h, i) => (
                  <div className="row mt-s" key={i} style={{ flexWrap: 'nowrap' }}>
                    <input className="input" value={h.day} onChange={setList('hours', i, 'day')} aria-label="Gün" />
                    <input className="input" value={h.time} onChange={setList('hours', i, 'time')} aria-label="Saat" />
                    <button type="button" className="btn icon ghost" onClick={() => set('hours')(f.hours.filter((_, j) => j !== i))} aria-label="Kaldır"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" className="btn sm mt-s" onClick={() => set('hours')([...(f.hours || []), { day: '', time: '' }])}><Plus size={14} />Satır ekle</button>
              </div>
            </fieldset>
          </Card>
          <ImageManager images={data.images} reload={load} canWrite={w} />
        </div>
        <div className="stack">
          <Card title="Ana sayfa & Hakkımızda">
            <fieldset disabled={!w} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <Input label="Vitrin başlığı" hint="virgülden sonrası altın renkte" value={f.hero_title || ''} onChange={set('hero_title')} />
              <Input label="Vitrin alt yazısı" value={f.hero_text || ''} onChange={set('hero_text')} />
              <Input label="Hakkımızda başlığı" value={f.about_title || ''} onChange={set('about_title')} />
              <Textarea label="Hakkımızda metni" hint="paragraflar arasında boş satır" style={{ minHeight: 180 }} value={f.about_text || ''} onChange={set('about_text')} />
              <div>
                <b className="small">Öne çıkan değerler</b>
                {(f.values || []).map((v, i) => (
                  <div className="row mt-s" key={i} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <input className="input" style={{ maxWidth: 170 }} value={v.title} onChange={setList('values', i, 'title')} aria-label="Başlık" />
                    <input className="input" value={v.text} onChange={setList('values', i, 'text')} aria-label="Açıklama" />
                    <button type="button" className="btn icon ghost" onClick={() => set('values')(f.values.filter((_, j) => j !== i))} aria-label="Kaldır"><X size={16} /></button>
                  </div>
                ))}
                {(f.values || []).length < 8 && <button type="button" className="btn sm mt-s" onClick={() => set('values')([...(f.values || []), { title: '', text: '' }])}><Plus size={14} />Ekle</button>}
              </div>
            </fieldset>
          </Card>
          <Card title="Sitede gösterilecek fiyatlar">
            <fieldset disabled={!w} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="row">{prices.length ? null : <span className="xs muted">Fiyat listesi yükleniyor…</span>}</div>
              <div className="grid c2">{prices.map((p) => (
                <Check key={p.code} label={p.name} checked={(f.show_prices || []).includes(p.code)}
                  onChange={(e) => set('show_prices')(e.target.checked ? [...(f.show_prices || []), p.code] : f.show_prices.filter((c) => c !== p.code))} />
              ))}</div>
              <div className="mt"><Input label="Fiyat notu" value={f.price_note || ''} onChange={set('price_note')} /></div>
              <div className="mt"><Select label="Tema" value={f.theme || 'gold'} onChange={set('theme')} options={[['gold', 'Altın & Lacivert']]} /></div>
            </fieldset>
          </Card>
        </div>
      </div>
    </form>
  );
}
