import { Link } from 'react-router-dom';
import { money } from '../lib/format.js';

export default function ProductCard({ p }) {
  return (
    <Link to={`/urun/${p.id}`} className="pcard">
      <div className="img">
        <img src={p.image || '/img/urun/yuzuk.svg'} alt={p.name} loading="lazy" />
        {p.featured && <span className="badge gold">Öne çıkan</span>}
        {!p.in_stock && <span className="badge red" style={{ left: 'auto', right: 10 }}>Tükendi</span>}
      </div>
      <div className="info">
        <span className="t">{p.name}</span>
        <span className="m">{p.karat === '925' ? '925 ayar gümüş' : `${p.karat} ayar`} · {p.gram} gr</span>
        <span className="p">{p.price ? money(p.price, 0) : 'Fiyat için arayın'}</span>
      </div>
    </Link>
  );
}
