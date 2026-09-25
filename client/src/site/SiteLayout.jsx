import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Phone, MapPin, Clock, Mail, LogIn } from 'lucide-react';
import { SiteCtx, useSiteLoader, images } from './useSite.js';
import { usePrices } from '../hooks/usePrices.js';
import { price, waLink, telLink } from '../lib/format.js';
import { WhatsAppIcon, InstagramIcon } from './icons.jsx';

export function Logo({ site }) {
  const logo = images(site, 'logo')[0];
  const parts = (site?.name || 'Kuyumcu').split(' ');
  return (
    <Link to="/" className="logo" aria-label={`${site?.name || ''} ana sayfa`}>
      {logo ? <img src={logo.path} alt={site?.name} /> : <span className="mark">{parts[0].length <= 3 ? parts[0] : parts.map((p) => p[0]).slice(0, 2).join('')}</span>}
      {!logo && <span><b>{parts[0]}</b><small>{parts.slice(1).join(' ') || 'Kuyumculuk'}{site?.founded_year ? ` · ${site.founded_year}` : ''}</small></span>}
    </Link>
  );
}

function Ticker() {
  const { items } = usePrices();
  if (!items.length) return <div className="ticker" style={{ height: 36 }} />;
  const row = items.map((i) => (
    <span className="ticker-item" key={i.code}>
      {i.name}<b>{price(i.sell, i.code)}</b>
      {i.change ? <span className={`chg ${i.change > 0 ? 'up' : 'down'}`}>{i.change > 0 ? '▲' : '▼'} %{Math.abs(i.change).toFixed(2)}</span> : null}
    </span>
  ));
  return (
    <div className="ticker" aria-label="Anlık altın ve döviz fiyatları">
      <div className="ticker-track">{row}{row}</div>
    </div>
  );
}

export default function SiteLayout() {
  const site = useSiteLoader();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { if (site?.name) document.title = `${site.name} — ${site.slogan || 'Kuyumcu'}`; }, [site]);

  return (
    <SiteCtx.Provider value={site}>
      <div className="site">
        <Ticker />
        <header className="site-header">
          <div className="wrap">
            <Logo site={site} />
            <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Site menüsü">
              <NavLink to="/" end>Ana Sayfa</NavLink>
              <NavLink to="/urunler">Ürünlerimiz</NavLink>
              <NavLink to="/fiyatlar">Altın Fiyatları</NavLink>
              <NavLink to="/altin-hesapla">Altın Hesapla</NavLink>
              <NavLink to="/hakkimizda">Hakkımızda</NavLink>
              <NavLink to="/iletisim">İletişim</NavLink>
            </nav>
            {site?.phone && <a className="btn dark header-cta" href={telLink(site.phone)}><Phone size={16} />{site.phone}</a>}
            <button className="btn ghost icon menu-btn" onClick={() => setOpen(!open)} aria-label="Menü" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
          </div>
        </header>
        <main><Outlet /></main>
        <footer className="site-footer">
          <div className="wrap">
            <div className="cols">
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: '#fff', fontWeight: 700 }}>{site?.name}</div>
                <p style={{ marginTop: 8 }}>{site?.slogan}</p>
                <div className="row" style={{ gap: 8 }}>
                  {site?.instagram && <a className="btn sm outline-light" href={`https://instagram.com/${site.instagram}`} target="_blank" rel="noreferrer noopener"><InstagramIcon />Instagram</a>}
                  {site?.whatsapp && <a className="btn sm outline-light" href={waLink(site.whatsapp)} target="_blank" rel="noreferrer noopener"><WhatsAppIcon size={16} />WhatsApp</a>}
                </div>
              </div>
              <div>
                <h4>Sayfalar</h4>
                <Link to="/urunler">Ürünlerimiz</Link><Link to="/fiyatlar">Altın Fiyatları</Link><Link to="/altin-hesapla">Altın Hesaplama</Link>
                <Link to="/hakkimizda">Hakkımızda</Link><Link to="/iletisim">İletişim</Link><Link to="/kvkk">KVKK Aydınlatma Metni</Link>
              </div>
              <div>
                <h4>Koleksiyon</h4>
                <Link to="/urunler/pirlanta">Pırlanta</Link><Link to="/urunler/alyans">Alyans</Link><Link to="/urunler/bilezik">Bilezik</Link>
                <Link to="/urunler/kolye">Kolye</Link><Link to="/urunler/ziynet">Ziynet & Sarrafiye</Link>
              </div>
              <div>
                <h4>İletişim</h4>
                {site?.address && <p className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><MapPin size={16} style={{ flex: 'none', marginTop: 3 }} />{site.address}</p>}
                {site?.phone && <a href={telLink(site.phone)}><Phone size={14} /> {site.phone}</a>}
                {site?.email && <a href={`mailto:${site.email}`}><Mail size={14} /> {site.email}</a>}
                {(site?.hours || []).map((h) => <div key={h.day} className="small"><Clock size={13} /> {h.day}: {h.time}</div>)}
              </div>
            </div>
            <div className="bottom">
              <span>© {new Date().getFullYear()} {site?.name}. Tüm hakları saklıdır. Fiyatlar bilgi amaçlıdır.</span>
              <Link to="/panel" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><LogIn size={13} />Yönetim Paneli</Link>
            </div>
          </div>
        </footer>
        {site?.whatsapp && (
          <a className="wa-float" href={waLink(site.whatsapp, 'Merhaba, bilgi almak istiyorum.')} target="_blank" rel="noreferrer noopener" aria-label="WhatsApp ile yazın">
            <WhatsAppIcon />
          </a>
        )}
      </div>
    </SiteCtx.Provider>
  );
}
