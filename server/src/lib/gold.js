/**
 * Kuyumculuk hesap kuralları.
 * Has karşılığı = gram × milyem. Satış = gram × has satış × (milyem + işçilik milyemi) + sabit işçilik + taş.
 */
export const KARATS = {
  '24': { milyem: 0.995, label: '24 Ayar (Has)' },
  '22': { milyem: 0.916, label: '22 Ayar' },
  '21': { milyem: 0.875, label: '21 Ayar' },
  '18': { milyem: 0.750, label: '18 Ayar' },
  '14': { milyem: 0.585, label: '14 Ayar' },
  '10': { milyem: 0.417, label: '10 Ayar' },
  '8': { milyem: 0.333, label: '8 Ayar' },
  '925': { milyem: 0.925, label: '925 Ayar Gümüş' },
};

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export function milyemOf(karat, fallback) {
  if (fallback !== undefined && fallback !== null && fallback !== '') return Number(fallback);
  return KARATS[String(karat)]?.milyem ?? null;
}

export function roundPrice(value, step = 1) {
  if (!step || step <= 1) return Math.ceil(round2(value));
  return Math.ceil(value / step) * step;
}

/**
 * Ürün birim satış fiyatı (TL) ve has karşılığı.
 * prices: { CODE: { buy, sell } }
 */
export function productPricing(p, prices, rounding = 1) {
  const milyem = milyemOf(p.karat, p.milyem) ?? 0;
  const has = round3((p.gram || 0) * milyem);
  if (p.price_mode === 'fixed' && p.fixed_price) {
    return { unit: round2(p.fixed_price), has, labor: 0, basis: 'sabit' };
  }
  if (p.price_code) {
    const pi = prices[p.price_code];
    if (!pi?.sell) return { unit: null, has, labor: 0, basis: 'fiyat yok' };
    return { unit: round2(pi.sell), has, labor: 0, basis: p.price_code };
  }
  const base = p.kind === 'gumus' ? prices.GUMUS?.sell : prices.HAS?.sell;
  if (!base) return { unit: null, has, labor: 0, basis: 'fiyat yok' };
  const metal = (p.gram || 0) * base * milyem;
  const labor = (p.gram || 0) * base * (p.labor_milyem || 0) + (p.labor_tl || 0);
  const unit = roundPrice(metal + labor + (p.stone_price || 0), rounding);
  return { unit, has, labor: round2(labor), basis: p.kind === 'gumus' ? 'GUMUS' : 'HAS' };
}

/** Hurda/bozdurma alış değeri: gram × (1 − fire) × milyem × has alış */
export function scrapValue({ gram, karat, milyem, fire_pct = 0 }, hasBuy) {
  const m = milyemOf(karat, milyem) ?? 0;
  const has = round3(gram * (1 - (fire_pct || 0) / 100) * m);
  return { has, value: round2(has * hasBuy), milyem: m };
}
