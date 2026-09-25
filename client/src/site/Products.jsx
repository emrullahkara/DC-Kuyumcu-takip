import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import PageHero from './PageHero.jsx';
import ProductCard from './ProductCard.jsx';
import { Loading, Empty } from '../components/ui.jsx';

export default function Products() {
  const { category } = useParams();
  const [sp, setSp] = useSearchParams();
  const [cats, setCats] = useState([]);
  const [items, setItems] = useState(null);
  const q = sp.get('q') || '';
  const sort = sp.get('sirala') || '';
  const karat = sp.get('ayar') || '';

  useEffect(() => { fetch('/api/public/categories').then((r) => r.json()).then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    setItems(null);
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (q) params.set('q', q);
    if (karat) params.set('karat', karat);
    const sortMap = { artan: 'price_asc', azalan: 'price_desc', gram: 'gram' };
    if (sortMap[sort]) params.set('sort', sortMap[sort]);
    fetch(`/api/public/products?${params}`).then((r) => r.json()).then(setItems).catch(() => setItems([]));
  }, [category, q, sort, karat]);

  const current = cats.find((c) => c.slug === category);
  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  return (
    <>
      <PageHero title={current?.name || 'Ürünlerimiz'} crumb={current ? <><Link to="/urunler">Ürünler</Link> / {current.name}</> : 'Ürünler'} />
      <section className="section" style={{ paddingTop: 32 }}>
        <div className="wrap">
          <div className="filters">
            <Link to="/urunler" className={`chip ${!category ? 'on' : ''}`}>Tümü</Link>
            {cats.map((c) => <Link key={c.id} to={`/urunler/${c.slug}`} className={`chip ${category === c.slug ? 'on' : ''}`}>{c.name}</Link>)}
          </div>
          <div className="row mb">
            <div className="grow" style={{ position: 'relative', minWidth: 200 }}>
              <Search size={17} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
              <input className="input" style={{ paddingLeft: 38 }} placeholder="Ürün ara…" defaultValue={q} onKeyDown={(e) => e.key === 'Enter' && setParam('q', e.currentTarget.value)} onBlur={(e) => setParam('q', e.currentTarget.value)} aria-label="Ürün ara" />
            </div>
            <select className="select" style={{ width: 'auto' }} value={karat} onChange={(e) => setParam('ayar', e.target.value)} aria-label="Ayar">
              <option value="">Tüm ayarlar</option>
              {['22', '18', '14', '24', '925'].map((k) => <option key={k} value={k}>{k === '925' ? '925 gümüş' : `${k} ayar`}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setParam('sirala', e.target.value)} aria-label="Sıralama">
              <option value="">Önerilen</option>
              <option value="artan">Fiyat (artan)</option>
              <option value="azalan">Fiyat (azalan)</option>
              <option value="gram">Gram (yüksek)</option>
            </select>
          </div>
          {!items ? <Loading /> : items.length ? <div className="products-grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <Empty>Bu kriterlere uygun ürün bulunamadı.</Empty>}
          <p className="small muted mt center">Ürün fiyatları anlık has altın fiyatına göre hesaplanır ve gün içinde değişebilir. Kesin fiyat için mağazamızla iletişime geçiniz.</p>
        </div>
      </section>
    </>
  );
}
