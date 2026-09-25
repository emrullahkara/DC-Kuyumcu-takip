import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Scale, Hammer, BadgePercent, ArrowRight, Calculator, Phone, MapPin } from 'lucide-react';
import { useSite, images } from './useSite.js';
import { usePrices } from '../hooks/usePrices.js';
import { price, time, telLink, waLink } from '../lib/format.js';
import { CategoryIcon, WhatsAppIcon } from './icons.jsx';
import ProductCard from './ProductCard.jsx';

const HERO_CODES = ['HAS', 'GRAM', 'A22', 'CEYREK', 'YARIM', 'TAM', 'USD', 'EUR'];
const VALUE_ICONS = [ShieldCheck, BadgePercent, Hammer, Scale];

export function PriceCard() {
  const { items, flash, data } = usePrices();
  const rows = HERO_CODES.map((c) => items.find((i) => i.code === c)).filter(Boolean);
  return (
    <div className="hero-card">
      <h3>Anlık Piyasa <span className="live-dot">Canlı {data?.updatedAt ? `· ${time(data.updatedAt)}` : ''}</span></h3>
      <table>
        <thead><tr><th>Birim</th><th>Alış</th><th>Satış</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={flash[r.code] ? `flash-${flash[r.code]}` : ''}>
              <td>{r.name}</td>
              <td>{price(r.buy, r.code)}</td>
              <td><b style={{ color: 'var(--gold-200)' }}>{price(r.sell, r.code)}</b></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#8f98ad' }}>Fiyatlar yükleniyor…</td></tr>}
        </tbody>
      </table>
      <Link to="/fiyatlar" className="btn sm outline-light" style={{ marginTop: 14, width: '100%' }}>Tüm fiyatlar <ArrowRight size={15} /></Link>
    </div>
  );
}

export default function Home() {
  const site = useSite();
  const [cats, setCats] = useState([]);
  const [featured, setFeatured] = useState([]);
  useEffect(() => {
    fetch('/api/public/categories').then((r) => r.json()).then(setCats).catch(() => {});
    fetch('/api/public/products?featured=1').then((r) => r.json()).then((x) => setFeatured(x.slice(0, 8))).catch(() => {});
  }, []);
  const hero = images(site, 'hero')[0];
  const about = images(site, 'about')[0];
  const years = site?.founded_year ? new Date().getFullYear() - site.founded_year : null;

  return (
    <>
      <section className="hero" style={hero ? { backgroundImage: `linear-gradient(160deg, rgb(16 21 34 / 88%), rgb(11 15 25 / 94%)), url(${hero.path})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <svg className="hero-art" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="90" fill="none" stroke="#d4a93f" strokeWidth="6" /><circle cx="100" cy="100" r="70" fill="none" stroke="#d4a93f" strokeWidth="2" /></svg>
        <div className="wrap">
          <div>
            <div className="eyebrow">{years ? `${years} yıllık güven · ` : ''}{site?.address?.split(',').slice(-1)[0]?.trim() || 'Ankara'}</div>
            <h1>{site?.hero_title ? site.hero_title.split(',').map((part, i) => (i === 1 ? <em key={i}>,{part}</em> : <span key={i}>{part}</span>)) : 'Altının en saf hâli'}</h1>
            <p>{site?.hero_text}</p>
            <div className="cta">
              <Link to="/urunler" className="btn gold lg">Koleksiyonu keşfet <ArrowRight size={18} /></Link>
              {site?.whatsapp && <a href={waLink(site.whatsapp, 'Merhaba, bilgi almak istiyorum.')} className="btn outline-light lg" target="_blank" rel="noreferrer noopener"><WhatsAppIcon size={18} />WhatsApp'tan yazın</a>}
            </div>
          </div>
          <PriceCard />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Koleksiyonlar</div>
            <h2>Her anınıza yakışan bir parça</h2>
            <div className="divider" />
          </div>
          <div className="cat-grid">
            {cats.map((c) => (
              <Link key={c.id} to={`/urunler/${c.slug}`} className="cat">
                <span className="ic"><CategoryIcon name={c.icon} /></span>
                <b>{c.name}</b>
                <small>{c.count} ürün</small>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section alt">
          <div className="wrap">
            <div className="section-head">
              <div className="eyebrow">Vitrinden</div>
              <h2>Öne çıkan ürünler</h2>
              <p>Fiyatlar anlık has altın kuruna göre güncellenir.</p>
            </div>
            <div className="products-grid">{featured.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            <div className="center mt"><Link to="/urunler" className="btn dark lg">Tüm ürünler <ArrowRight size={18} /></Link></div>
          </div>
        </section>
      )}

      <section className="section dark">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow" style={{ color: 'var(--gold-300)' }}>Neden biz?</div>
            <h2>{site?.about_title || 'Güvenin adresi'}</h2>
          </div>
          <div className="values">
            {(site?.values || []).map((v, i) => {
              const Icon = VALUE_ICONS[i % VALUE_ICONS.length];
              return <div className="value" key={v.title}><Icon className="ic" size={28} /><b>{v.title}</b><p>{v.text}</p></div>;
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="about-img">
            {about ? <img src={about.path} alt={about.caption || site?.name} /> : (
              <div style={{ textAlign: 'center', color: 'var(--gold-200)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 72, lineHeight: 1 }}>{site?.founded_year || ''}</div>
                <div style={{ letterSpacing: '.2em', fontSize: 12, marginTop: 8 }}>YILINDAN BERİ</div>
              </div>
            )}
          </div>
          <div>
            <div className="section-head" style={{ textAlign: 'left', margin: '0 0 12px' }}>
              <div className="eyebrow">Hakkımızda</div>
              <h2>{site?.about_title}</h2>
            </div>
            <p style={{ color: 'var(--text-2)', whiteSpace: 'pre-line' }}>{site?.about_text?.split('\n\n')[0]}</p>
            <div className="row">
              <Link to="/hakkimizda" className="btn dark">Hikâyemiz <ArrowRight size={16} /></Link>
              <Link to="/altin-hesapla" className="btn"><Calculator size={16} />Altınım ne eder?</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap split">
          <div>
            <div className="section-head" style={{ textAlign: 'left', margin: '0 0 12px' }}>
              <div className="eyebrow">Mağazamız</div>
              <h2>Sizi dükkânımızda ağırlamaktan mutluluk duyarız</h2>
            </div>
            <div className="contact-card">
              {site?.address && <div className="contact-line"><span className="ic"><MapPin size={18} /></span><div>{site.address}</div></div>}
              {site?.phone && <div className="contact-line"><span className="ic"><Phone size={18} /></span><a href={telLink(site.phone)}>{site.phone}</a></div>}
              {(site?.hours || []).map((h) => <div className="contact-line" key={h.day}><span className="ic">⏱</span><div><b>{h.day}</b><div className="muted">{h.time}</div></div></div>)}
            </div>
          </div>
          {site?.map_query && (
            <iframe className="map" title="Mağaza konumu" loading="lazy" referrerPolicy="no-referrer"
              src={`https://www.google.com/maps?q=${encodeURIComponent(site.map_query)}&output=embed`} />
          )}
        </div>
      </section>
    </>
  );
}
