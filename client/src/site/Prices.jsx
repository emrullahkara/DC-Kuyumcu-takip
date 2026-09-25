import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import PageHero from './PageHero.jsx';
import { usePrices } from '../hooks/usePrices.js';
import { useSite } from './useSite.js';
import { price, dateTime } from '../lib/format.js';
import { Loading } from '../components/ui.jsx';

const GROUPS = [['altin', 'Altın (gram)'], ['sarrafiye', 'Ziynet / Sarrafiye (adet)'], ['gumus', 'Gümüş'], ['doviz', 'Döviz']];

export default function Prices() {
  const { items, flash, data } = usePrices();
  const site = useSite();
  return (
    <>
      <PageHero title="Canlı Altın & Döviz Fiyatları" crumb="Fiyatlar" />
      <section className="section" style={{ paddingTop: 32 }}>
        <div className="wrap">
          <div className="row between mb">
            <span className="live-dot" style={{ color: 'var(--success)' }}>Canlı · Son güncelleme {dateTime(data?.updatedAt)}</span>
            <Link to="/altin-hesapla" className="btn"><Calculator size={16} />Altın hesaplama</Link>
          </div>
          {!items.length ? <Loading /> : (
            <div className="table-wrap">
              <table className="prices-table">
                <thead><tr><th>Birim</th><th>Alış (₺)</th><th>Satış (₺)</th><th>Değişim</th></tr></thead>
                <tbody>
                  {GROUPS.map(([cat, label]) => {
                    const rows = items.filter((i) => i.category === cat);
                    if (!rows.length) return null;
                    return [
                      <tr key={cat} className="prices-group"><td colSpan={4}>{label}</td></tr>,
                      ...rows.map((r) => (
                        <tr key={r.code} className={flash[r.code] ? `flash-${flash[r.code]}` : ''}>
                          <td><b>{r.name}</b></td>
                          <td>{price(r.buy, r.code)}</td>
                          <td><b>{price(r.sell, r.code)}</b></td>
                          <td className={r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'muted'}>{r.change ? `${r.change > 0 ? '▲' : '▼'} %${Math.abs(r.change).toFixed(2)}` : '—'}</td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted mt">{site?.price_note || 'Fiyatlar bilgi amaçlıdır.'} "Alış" mağazamızın sizden alış, "Satış" size satış fiyatıdır.</p>
        </div>
      </section>
    </>
  );
}
