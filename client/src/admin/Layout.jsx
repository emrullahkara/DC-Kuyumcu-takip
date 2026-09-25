import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Receipt, Scale, Wrench, Gem, Users, Truck, Wallet, BarChart3, UserCog,
  Globe, MessageSquare, ShieldCheck, ScrollText, Settings, Menu, LogOut, Sun, Moon, Plus, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from './auth.jsx';
import { api, A } from '../lib/api.js';
import { usePrices } from '../hooks/usePrices.js';
import { price } from '../lib/format.js';
import { Loading } from '../components/ui.jsx';

export const NAV = [
  { group: 'Genel', items: [
    { to: '/panel', label: 'Gösterge Paneli', icon: LayoutDashboard, module: 'dashboard', end: true },
    { to: '/panel/fiyatlar', label: 'Fiyat & Kur', icon: TrendingUp, module: 'prices' },
  ] },
  { group: 'İşlemler', items: [
    { to: '/panel/satis', label: 'Hızlı Satış', icon: ShoppingCart, module: 'sales', level: 'w' },
    { to: '/panel/satislar', label: 'Satışlar', icon: Receipt, module: 'sales' },
    { to: '/panel/alis', label: 'Alış & Bozdurma', icon: Scale, module: 'purchases' },
    { to: '/panel/tamir', label: 'Tamir & Sipariş', icon: Wrench, module: 'repairs' },
  ] },
  { group: 'Stok & Cari', items: [
    { to: '/panel/urunler', label: 'Ürünler & Stok', icon: Gem, module: 'products' },
    { to: '/panel/musteriler', label: 'Müşteriler', icon: Users, module: 'customers' },
    { to: '/panel/tedarikciler', label: 'Tedarikçiler', icon: Truck, module: 'suppliers' },
  ] },
  { group: 'Finans & Ekip', items: [
    { to: '/panel/kasa', label: 'Kasa & Gelir-Gider', icon: Wallet, module: 'cash' },
    { to: '/panel/raporlar', label: 'Raporlar', icon: BarChart3, module: 'reports' },
    { to: '/panel/personel', label: 'Personel', icon: UserCog, module: 'staff' },
  ] },
  { group: 'Web Sitesi', items: [
    { to: '/panel/site', label: 'Site Yönetimi', icon: Globe, module: 'site' },
    { to: '/panel/talepler', label: 'Web Talepleri', icon: MessageSquare, module: 'inquiries', badge: 'inquiries' },
  ] },
  { group: 'Sistem', items: [
    { to: '/panel/kullanicilar', label: 'Kullanıcılar', icon: ShieldCheck, module: 'users' },
    { to: '/panel/denetim', label: 'Denetim Kaydı', icon: ScrollText, module: 'audit' },
    { to: '/panel/ayarlar', label: 'Ayarlar', icon: Settings, module: 'settings' },
  ] },
];

const TitleCtx = createContext(() => {});
/** Sayfa başlığını üst çubuğa yazar */
export function usePageTitle(title) {
  const set = useContext(TitleCtx);
  useEffect(() => { set(title); document.title = `${title} · Kuyumcu Paneli`; }, [title, set]);
}

function useTheme() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('dc-theme') || ''; } catch { return ''; } });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('dc-theme', theme); } catch { /* yoksay */ }
  }, [theme]);
  const dark = theme === 'dark' || (!theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return [dark, () => setTheme(dark ? 'light' : 'dark')];
}

export default function Layout() {
  const { user, loading, can, logout, flag } = useAuth();
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const [dark, toggleTheme] = useTheme();
  const loc = useLocation();
  const { byCode } = usePrices();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!user || !can('inquiries')) return;
    api.get(A('/inquiries')).then((rows) => setBadges({ inquiries: rows.filter((r) => r.status === 'yeni').length })).catch(() => {});
  }, [user, loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="admin-root"><Loading /></div>;
  if (!user) return <Navigate to="/panel/giris" state={{ from: loc.pathname, expired: flag === 'expired' }} replace />;
  if ((flag === 'MUST_CHANGE_PASSWORD' || flag === 'MFA_SETUP_REQUIRED') && loc.pathname !== '/panel/profil') return <Navigate to="/panel/profil" replace />;

  const initials = user.full_name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const ticker = ['HAS', 'GRAM', 'A22', 'CEYREK', 'USD', 'EUR'].map((c) => byCode[c]).filter(Boolean);

  return (
    <TitleCtx.Provider value={setTitle}>
      <div className="admin-root">
        <div className="admin-shell">
          {open && <div className="sidebar-back" onClick={() => setOpen(false)} />}
          <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Ana menü">
            <Link to="/panel" className="brand">
              <span className="brand-mark">DC</span>
              <span><b>Kuyumcu Takip</b><small>Yönetim Paneli</small></span>
            </Link>
            <nav>
              {NAV.map((g) => {
                const items = g.items.filter((i) => can(i.module, i.level || 'r'));
                if (!items.length) return null;
                return (
                  <div className="nav-group" key={g.group}>
                    <small>{g.group}</small>
                    {items.map((i) => (
                      <NavLink key={i.to} to={i.to} end={i.end} className="nav-link">
                        <i.icon size={18} />{i.label}
                        {i.badge && badges[i.badge] > 0 && <span className="count">{badges[i.badge]}</span>}
                      </NavLink>
                    ))}
                  </div>
                );
              })}
            </nav>
            <div className="foot">
              <Link to="/panel/profil" className="user-chip">
                <span className="avatar">{initials}</span>
                <span className="grow"><b style={{ display: 'block', fontSize: 14, color: '#fff' }}>{user.full_name}</b><small style={{ color: '#8b93a7' }}>{user.role_label}</small></span>
              </Link>
              <div className="row" style={{ marginTop: 8 }}>
                <a href="/" target="_blank" rel="noreferrer" className="btn sm ghost" style={{ color: '#cfd5e2' }}><Globe size={15} />Siteyi gör</a>
                <button className="btn sm ghost" style={{ color: '#cfd5e2', marginLeft: 'auto' }} onClick={logout}><LogOut size={15} />Çıkış</button>
              </div>
            </div>
          </aside>
          <div className="main">
            <header className="topbar">
              <button className="btn ghost icon mobile-only" onClick={() => setOpen(true)} aria-label="Menüyü aç"><Menu size={20} /></button>
              <h1>{title}</h1>
              <div className="spacer" />
              <div className="ticker-mini" aria-label="Anlık fiyatlar">
                {ticker.map((p) => <span key={p.code}>{p.name.replace(' (24 Ayar)', '')} <b>{price(p.sell, p.code)}</b></span>)}
              </div>
              <button className="btn ghost icon" onClick={toggleTheme} aria-label="Tema değiştir" title="Açık/koyu tema">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            </header>
            <main className="content">
              <Outlet />
            </main>
          </div>
        </div>
        <nav className="bottom-nav" aria-label="Hızlı menü">
          <NavLink to="/panel" end><LayoutDashboard size={21} />Özet</NavLink>
          <NavLink to="/panel/fiyatlar"><TrendingUp size={21} />Fiyat</NavLink>
          {can('sales', 'w') ? <NavLink to="/panel/satis" className="fab"><span className="ico"><Plus size={24} /></span>Satış</NavLink> : <NavLink to="/panel/tamir"><Wrench size={21} />Tamir</NavLink>}
          {can('products') ? <NavLink to="/panel/urunler"><Gem size={21} />Stok</NavLink> : <NavLink to="/panel/profil"><UserCog size={21} />Profil</NavLink>}
          <button onClick={() => setOpen(true)}><MoreHorizontal size={21} />Menü</button>
        </nav>
      </div>
    </TitleCtx.Provider>
  );
}

/** Yetkisiz sayfaya girişi engeller */
export function RequirePerm({ module, level = 'r', children }) {
  const { can } = useAuth();
  if (!can(module, level)) return <div className="alert warn">Bu sayfayı görüntüleme yetkiniz yok.</div>;
  return children;
}
