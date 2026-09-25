import { useMemo, useState } from 'react';
import PageHero from './PageHero.jsx';
import { usePrices } from '../hooks/usePrices.js';
import { money, KARAT_MILYEM } from '../lib/format.js';
import InquiryForm from './InquiryForm.jsx';

const COINS = [['CEYREK', 'Çeyrek'], ['YARIM', 'Yarım'], ['TAM', 'Tam'], ['CUMHURIYET', 'Cumhuriyet'], ['ATA', 'Ata'], ['RESAT', 'Reşat'], ['GREMSE', 'Gremse'], ['GRAM', 'Gram altın']];

export default function Calculator() {
  const { byCode } = usePrices();
  const [mode, setMode] = useState('gram');
  const [karat, setKarat] = useState('22');
  const [grams, setGrams] = useState('10');
  const [coin, setCoin] = useState('CEYREK');
  const [qty, setQty] = useState('1');

  const res = useMemo(() => {
    const has = byCode.HAS;
    if (mode === 'gram') {
      const g = parseFloat(String(grams).replace(',', '.')) || 0;
      const m = KARAT_MILYEM[karat] || 0;
      if (!has) return null;
      return { hasGram: g * m, buy: g * m * has.buy, sell: g * m * has.sell };
    }
    const c = byCode[coin];
    const n = parseInt(qty, 10) || 0;
    if (!c) return null;
    return { buy: n * c.buy, sell: n * c.sell };
  }, [mode, karat, grams, coin, qty, byCode]);

  return (
    <>
      <PageHero title="Altınım Ne Eder?" crumb="Altın Hesaplama" />
      <section className="section" style={{ paddingTop: 32 }}>
        <div className="wrap split" style={{ alignItems: 'start' }}>
          <div className="calc">
            <div className="seg mb" role="tablist">
              <button type="button" className={mode === 'gram' ? 'on' : ''} onClick={() => setMode('gram')}>Gram / Ayar</button>
              <button type="button" className={mode === 'coin' ? 'on' : ''} onClick={() => setMode('coin')}>Çeyrek / Ziynet</button>
            </div>
            {mode === 'gram' ? (
              <div className="grid c2">
                <label className="field"><span>Ayar</span>
                  <select className="select" value={karat} onChange={(e) => setKarat(e.target.value)}>
                    {['24', '22', '21', '18', '14', '8'].map((k) => <option key={k} value={k}>{k} ayar (milyem {KARAT_MILYEM[k]})</option>)}
                  </select>
                </label>
                <label className="field"><span>Gram</span><input className="input" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} /></label>
              </div>
            ) : (
              <div className="grid c2">
                <label className="field"><span>Tür</span>
                  <select className="select" value={coin} onChange={(e) => setCoin(e.target.value)}>{COINS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
                </label>
                <label className="field"><span>Adet</span><input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
              </div>
            )}
            <div className="result">
              <div className="small" style={{ color: '#aeb6c7' }}>Yaklaşık bozdurma (alış) değeri</div>
              <b>{res ? money(res.buy, 0) : '—'}</b>
              <div className="row between small mt-s" style={{ color: '#aeb6c7' }}>
                {res?.hasGram !== undefined && <span>Has karşılığı: {res.hasGram.toFixed(3)} gr</span>}
                <span>Satış değeri: {res ? money(res.sell, 0) : '—'}</span>
              </div>
            </div>
            <p className="small muted mt">Hesaplama bilgi amaçlıdır. Takılarda işçilik, taş ve fire durumu kesin değeri etkiler; ürününüzü mağazamızda ücretsiz olarak tartıp ayar ölçümü yapıyoruz.</p>
          </div>
          <div>
            <h2 style={{ fontSize: 34 }}>Eski altınlarınız değerinde</h2>
            <p style={{ color: 'var(--text-2)' }}>Kırık, eski veya kullanmadığınız altınlarınızı gözünüzün önünde tartıyor, ayarını ölçüyor ve güncel has fiyatından, şeffaf fire oranıyla değerlendiriyoruz. İsterseniz yeni ürünle takas yapabilirsiniz.</p>
            <div className="card card-pad"><h3 style={{ fontSize: 16 }}>Randevu / bilgi için sizi arayalım</h3><InquiryForm placeholder="Getirmek istediğiniz altınlar (ör. 3 bilezik, 2 çeyrek)" /></div>
          </div>
        </div>
      </section>
    </>
  );
}
