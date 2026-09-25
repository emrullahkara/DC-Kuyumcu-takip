import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Phone, ShieldCheck, Truck } from 'lucide-react';
import { useSite } from './useSite.js';
import { money, waLink, telLink } from '../lib/format.js';
import { Loading } from '../components/ui.jsx';
import { WhatsAppIcon } from './icons.jsx';
import ProductCard from './ProductCard.jsx';
import InquiryForm from './InquiryForm.jsx';

export default function ProductDetail() {
  const { id } = useParams();
  const site = useSite();
  const [p, setP] = useState(undefined);
  useEffect(() => {
    setP(undefined);
    fetch(`/api/public/products/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).then(setP).catch(() => setP(null));
  }, [id]);
  useEffect(() => { if (p?.name) document.title = `${p.name} — ${site?.name || ''}`; }, [p, site]);

  if (p === undefined) return <Loading />;
  if (!p) return <div className="wrap section"><h2>Ürün bulunamadı</h2><Link to="/urunler" className="btn">Ürünlere dön</Link></div>;
  const msg = `Merhaba, "${p.name}" (${p.karat} ayar, ${p.gram} gr) hakkında bilgi almak istiyorum.`;

  return (
    <section className="section" style={{ paddingTop: 32 }}>
      <div className="wrap">
        <div className="small muted mb"><Link to="/">Ana Sayfa</Link> / <Link to="/urunler">Ürünler</Link> / <Link to={`/urunler/${p.category_slug}`}>{p.category}</Link></div>
        <div className="pdetail">
          <div className="img"><img src={p.image || '/img/urun/yuzuk.svg'} alt={p.name} /></div>
          <div>
            <span className="badge gold">{p.category}</span>
            <h1 style={{ marginTop: 10 }}>{p.name}</h1>
            <div className="price">{p.price ? money(p.price, 0) : 'Fiyat için arayınız'}</div>
            {p.price && <div className="small muted">Güncel has altın fiyatına göre hesaplanmıştır; işçilik dahildir.</div>}
            <dl className="spec mt">
              <dt>Ayar</dt><dd>{p.karat === '925' ? '925 ayar gümüş' : `${p.karat} ayar`}</dd>
              <dt>Ağırlık</dt><dd>{p.gram} gram</dd>
              {p.stone_desc && <><dt>Taş</dt><dd>{p.stone_desc}</dd></>}
              <dt>Durum</dt><dd>{p.in_stock ? <span className="badge green">Mağazada mevcut</span> : <span className="badge red">Sipariş üzerine</span>}</dd>
            </dl>
            {p.description && <p className="mt" style={{ color: 'var(--text-2)' }}>{p.description}</p>}
            <div className="row mt">
              {site?.whatsapp && <a className="btn lg" style={{ background: '#25d366', borderColor: '#25d366', color: '#fff' }} href={waLink(site.whatsapp, msg)} target="_blank" rel="noreferrer noopener"><WhatsAppIcon size={18} />WhatsApp ile sor</a>}
              {site?.phone && <a className="btn dark lg" href={telLink(site.phone)}><Phone size={18} />Hemen ara</a>}
            </div>
            <div className="row mt small muted"><ShieldCheck size={16} />Ayar damgalı ve faturalı <Truck size={16} style={{ marginLeft: 12 }} />Mağazadan teslim</div>
            <div className="card card-pad mt">
              <h3 style={{ fontSize: 16 }}>Sizi arayalım</h3>
              <InquiryForm productId={p.id} />
            </div>
          </div>
        </div>
        {p.related?.length > 0 && (
          <div className="mt" style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: 30 }}>Benzer ürünler</h2>
            <div className="products-grid">{p.related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
