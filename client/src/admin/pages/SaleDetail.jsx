import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Printer, MessageCircle, Ban, Plus } from 'lucide-react';
import { api, A } from '../../lib/api.js';
import { money, gram, has, dateTime, curAmount, waLink } from '../../lib/format.js';
import { usePageTitle } from '../Layout.jsx';
import { useAuth } from '../auth.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Loading, ErrorBox, Badge, Card, Modal, Textarea, useToast } from '../../components/ui.jsx';
import './grupB.css';

const DEFAULT_FOOTER = 'Bizi tercih ettiğiniz için teşekkür ederiz.';

/** Kasa hareketinden ödeme türü etiketi */
export function paymentLabel(m) {
  if (m.direction === 'out') return m.description?.includes('para üstü') ? 'Para üstü' : 'Çıkış';
  if (m.category === 'takas') return 'Eski altın takası';
  if (m.currency !== 'TRY' && m.currency !== 'HAS') return `Döviz (${m.currency})`;
  if (m.account === 'pos') return 'Kredi kartı';
  if (m.account === 'banka') return 'Havale/EFT';
  return 'Nakit';
}

/** İşletme adı (web sitesi ayarlarından) — fişler ve WhatsApp metinleri için */
export function useBusinessName() {
  const [name, setName] = useState('');
  useEffect(() => {
    api.get('/api/public/site').then((s) => setName(s.name || '')).catch(() => {});
  }, []);
  return name;
}

export default function SaleDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const { data: s, loading, error, reload } = useApi(A(`/sales/${id}`));
  const bizName = useBusinessName();
  const [footer, setFooter] = useState(DEFAULT_FOOTER);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  usePageTitle(s ? `Satış ${s.no}` : 'Satış detayı');

  // Fiş altı notu yalnızca ayar yetkisi olanlar için okunabilir; yoksa sabit metin
  useEffect(() => {
    if (!can('settings')) return;
    api.get(A('/settings')).then((b) => b.receipt_footer && setFooter(b.receipt_footer)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !s) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!s) return null;

  const cancelled = s.status === 'iptal';
  const payments = s.payments || [];
  const inflows = payments.filter((p) => p.direction === 'in');
  const changeOut = payments.filter((p) => p.direction === 'out').reduce((t, p) => t + p.amount_try, 0);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.post(A(`/sales/${s.id}/cancel`), { reason: reason.trim() });
      toast('Satış iptal edildi; stok ve kasa hareketleri geri alındı');
      setCancelOpen(false);
      reload();
    } catch (err) { toast(err); } finally { setBusy(false); }
  };

  // WhatsApp özet metni
  const waText = [
    `Sayın ${s.customer_name || 'müşterimiz'},`,
    `${bizName || 'Mağazamız'} — ${s.no} numaralı alışverişinizin özeti (${dateTime(s.ts)}):`,
    ...s.items.map((i) => `• ${i.description}${i.qty > 1 ? ` × ${i.qty}` : ''}${i.karat ? ` (${i.karat} ayar${i.gram ? `, ${String(i.gram).replace('.', ',')} gr` : ''})` : ''}: ${money(i.total)}`),
    s.discount > 0 ? `İndirim: −${money(s.discount)}` : null,
    `Toplam: ${money(s.total)}`,
    s.credit_total > 0 ? `Veresiye (açık hesap): ${money(s.credit_total)}` : null,
    footer,
  ].filter(Boolean).join('\n');

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-actions no-print">
        <Link to="/panel/satislar" className="btn"><ArrowLeft size={16} />Satışlar</Link>
        <span className="grow" />
        <button className="btn" onClick={() => window.print()}><Printer size={16} />Fişi yazdır</button>
        {s.customer_phone && (
          <a className="btn" href={waLink(s.customer_phone, waText)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Fişi WhatsApp ile gönder</a>
        )}
        {can('sales', 'w') && !cancelled && <button className="btn danger" onClick={() => setCancelOpen(true)}><Ban size={16} />İptal et</button>}
        {can('sales', 'w') && <Link to="/panel/satis" className="btn primary"><Plus size={16} />Yeni satış</Link>}
      </div>

      {cancelled && (
        <div className="alert error no-print"><Ban size={18} /><div>
          <b>Bu satış iptal edildi</b> ({dateTime(s.cancelled_at)}). Gerekçe: {s.cancel_reason}
        </div></div>
      )}

      <div className="gb-detail">
        <div className="stack no-print" style={{ gap: 16 }}>
          <Card title={<>{s.no} {cancelled ? <Badge tone="red">İptal</Badge> : <Badge tone="green">Tamamlandı</Badge>}</>}>
            <dl className="kv" style={{ margin: 0 }}>
              <dt>Tarih</dt><dd>{dateTime(s.ts)}</dd>
              <dt>Müşteri</dt><dd>{s.customer_id ? <Link to={`/panel/musteriler/${s.customer_id}`}>{s.customer_name}</Link> : 'Perakende müşteri'}
                {s.tckn_masked && <span className="muted small"> · TC {s.tckn_masked}</span>}</dd>
              <dt>Kaydeden</dt><dd>{s.user_name}{s.staff_name && s.staff_name !== s.user_name ? ` · Satış: ${s.staff_name}` : ''}</dd>
              <dt>Ara toplam</dt><dd className="num">{money(s.subtotal)}</dd>
              {s.discount > 0 && <><dt>İndirim</dt><dd className="num">− {money(s.discount)}</dd></>}
              <dt>Toplam</dt><dd className="num"><b style={{ fontSize: 18 }}>{money(s.total)}</b></dd>
              <dt>Has karşılığı</dt><dd className="num">{has(s.has_total)}</dd>
              {s.note && <><dt>Not</dt><dd>{s.note}</dd></>}
            </dl>
          </Card>

          <Card title="Kalemler" pad={false}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Ürün</th><th className="gb-hide-sm">Ayar</th><th className="right gb-hide-sm">Gram</th><th className="right">Adet</th><th className="right gb-hide-sm">Birim</th><th className="right">Tutar</th></tr></thead>
                <tbody>
                  {s.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.description}{!i.product_id && <span className="xs muted"> (serbest)</span>}</td>
                      <td className="gb-hide-sm">{i.karat || '—'}</td>
                      <td className="right gb-hide-sm num nowrap">{i.gram ? gram(i.gram) : '—'}</td>
                      <td className="right">{i.qty}</td>
                      <td className="right gb-hide-sm num nowrap">{money(i.unit_price)}</td>
                      <td className="right num nowrap"><b>{money(i.total)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Ödemeler" pad={false}>
            {payments.length === 0 && !s.credit?.length ? <div className="card-body small muted">Kayıtlı ödeme yok.</div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Tür</th><th className="gb-hide-sm">Hesap</th><th className="right">Miktar</th><th className="right">TL karşılığı</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className={p.cancelled ? 'gb-cancel' : ''}>
                        <td>{paymentLabel(p)}{p.cancelled ? <span className="xs"> (iptal)</span> : ''}
                          {p.category === 'takas' && <div className="xs muted">{p.description?.split('—')[1]?.trim()}</div>}</td>
                        <td className="gb-hide-sm">{{ kasa: 'Kasa', pos: 'POS', banka: 'Banka' }[p.account]}</td>
                        <td className="right num nowrap gb-amt">{p.direction === 'out' ? '− ' : ''}{curAmount(p.amount, p.currency)}</td>
                        <td className="right num nowrap gb-amt">{p.direction === 'out' ? '− ' : ''}{money(p.amount_try)}</td>
                      </tr>
                    ))}
                    {(s.credit || []).map((c) => (
                      <tr key={`c${c.id}`} className={c.type === 'iptal' ? 'gb-cancel' : ''}>
                        <td>{c.type === 'iptal' ? 'Veresiye iptali' : 'Veresiye (açık hesap)'}</td>
                        <td className="gb-hide-sm">Müşteri cari</td>
                        <td className="right num nowrap">{curAmount(c.amount, c.currency)}</td>
                        <td className="right num nowrap">{c.currency === 'TRY' ? money(c.amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Yazdırılabilir fiş */}
        <section className="card gb-print-wrap" aria-label="Fiş önizleme">
          <div className="card-head no-print"><h3>Fiş</h3><button className="btn sm" onClick={() => window.print()}><Printer size={15} />Yazdır</button></div>
          <div className="card-body" style={{ background: 'var(--surface-2)' }}>
            <div className="receipt">
              <h4>{bizName || 'Kuyumcu'}</h4>
              <div className="r-center">SATIŞ FİŞİ</div>
              <hr />
              <div className="r-row"><span>Fiş no</span><span>{s.no}</span></div>
              <div className="r-row"><span>Tarih</span><span>{dateTime(s.ts)}</span></div>
              {s.customer_name && <div className="r-row"><span>Müşteri</span><span>{s.customer_name}</span></div>}
              {s.staff_name && <div className="r-row"><span>Satış</span><span>{s.staff_name}</span></div>}
              {cancelled && <div className="r-center"><b>*** İPTAL EDİLDİ ***</b></div>}
              <hr />
              {s.items.map((i) => (
                <div key={i.id} style={{ marginBottom: 4 }}>
                  <div>{i.description}</div>
                  <div className="r-row">
                    <span>{i.qty} x {money(i.unit_price)}{i.karat ? ` ${i.karat}A` : ''}{i.gram ? ` ${String(i.gram).replace('.', ',')}gr` : ''}</span>
                    <span>{money(i.total)}</span>
                  </div>
                </div>
              ))}
              <hr />
              {s.discount > 0 && <><div className="r-row"><span>Ara toplam</span><span>{money(s.subtotal)}</span></div>
                <div className="r-row"><span>İndirim</span><span>-{money(s.discount)}</span></div></>}
              <div className="r-row" style={{ fontSize: 15 }}><b>TOPLAM</b><b>{money(s.total)}</b></div>
              <hr />
              {inflows.map((p) => (
                <div className="r-row" key={p.id}><span>{paymentLabel(p)}{p.currency !== 'TRY' ? ` (${curAmount(p.amount, p.currency)})` : ''}</span><span>{money(p.amount_try)}</span></div>
              ))}
              {s.credit_total > 0 && <div className="r-row"><span>Veresiye</span><span>{money(s.credit_total)}</span></div>}
              {changeOut > 0 && <div className="r-row"><span>Para üstü</span><span>{money(changeOut)}</span></div>}
              <hr />
              <div className="r-center small">{footer}</div>
              <div className="r-center xs" style={{ marginTop: 6 }}>Bu belge bilgi fişidir, mali değeri yoktur.</div>
            </div>
          </div>
        </section>
      </div>

      {cancelOpen && (
        <Modal title={`${s.no} satışını iptal et`} onClose={() => setCancelOpen(false)} footer={<>
          <button className="btn" onClick={() => setCancelOpen(false)}>Vazgeç</button>
          <button className="btn danger" disabled={busy || reason.trim().length < 3} onClick={cancel}><Ban size={16} />İptal et</button>
        </>}>
          <div className="stack">
            <div className="alert warn">İptal geri alınamaz. Ürünler stoğa geri döner, kasa hareketleri ve veresiye kayıtları iptal edilir.</div>
            <Textarea label="İptal gerekçesi" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300}
              placeholder="Örn. müşteri vazgeçti, ürün değişimi…" />
          </div>
        </Modal>
      )}
    </div>
  );
}
