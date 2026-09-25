import { EventEmitter } from 'node:events';
import { q, tx, nowIso, isoAgo } from '../db/index.js';
import { config } from '../config.js';
import { round2 } from '../lib/gold.js';

export const priceEvents = new EventEmitter();
priceEvents.setMaxListeners(1000);

/** Fiyat kalemleri ve kaynaklardaki olası anahtar adları */
export const PRICE_DEFS = [
  { code: 'HAS', name: 'Has Altın', category: 'altin', unit: 'gram', milyem: 0.995, aliases: ['gram-has-altin', 'hasaltin', 'gramhasaltin', 'has'] },
  { code: 'GRAM', name: 'Gram Altın (24 Ayar)', category: 'altin', unit: 'gram', milyem: 0.995, aliases: ['gram-altin', 'gra', 'gramaltin'] },
  { code: 'A22', name: '22 Ayar Bilezik', category: 'altin', unit: 'gram', milyem: 0.916, aliases: ['22-ayar-bilezik', 'yia', '22ayarbilezik', '22ayaraltin'] },
  { code: 'A18', name: '18 Ayar Altın', category: 'altin', unit: 'gram', milyem: 0.75, aliases: ['18-ayar-altin', '18ayaraltin', 'ons18'] },
  { code: 'A14', name: '14 Ayar Altın', category: 'altin', unit: 'gram', milyem: 0.585, aliases: ['14-ayar-altin', '14ayaraltin'] },
  { code: 'CEYREK', name: 'Çeyrek Altın', category: 'sarrafiye', unit: 'adet', milyem: 0.916, grams: 1.75, aliases: ['ceyrek-altin', 'ceyrekaltin', 'yeniceyrekaltin'] },
  { code: 'YARIM', name: 'Yarım Altın', category: 'sarrafiye', unit: 'adet', milyem: 0.916, grams: 3.5, aliases: ['yarim-altin', 'yarimaltin'] },
  { code: 'TAM', name: 'Tam Altın', category: 'sarrafiye', unit: 'adet', milyem: 0.916, grams: 7.0, aliases: ['tam-altin', 'tamaltin'] },
  { code: 'CUMHURIYET', name: 'Cumhuriyet Altını', category: 'sarrafiye', unit: 'adet', milyem: 0.916, grams: 7.216, aliases: ['cumhuriyet-altini', 'cumhuriyetaltini'] },
  { code: 'ATA', name: 'Ata Altın', category: 'sarrafiye', unit: 'adet', milyem: 0.916, grams: 7.216, aliases: ['ata-altin', 'ataaltin'] },
  { code: 'RESAT', name: 'Reşat Altın', category: 'sarrafiye', unit: 'adet', milyem: 0.916, grams: 7.216, aliases: ['resat-altin', 'resataltin'] },
  { code: 'GREMSE', name: 'Gremse Altın', category: 'sarrafiye', unit: 'adet', milyem: 0.916, grams: 17.54, aliases: ['gremse-altin', 'gremsealtin'] },
  { code: 'GUMUS', name: 'Gümüş', category: 'gumus', unit: 'gram', milyem: 0.999, aliases: ['gumus', 'gms', 'gramgumus'] },
  { code: 'USD', name: 'Amerikan Doları', category: 'doviz', unit: 'adet', aliases: ['usd', 'dolar'] },
  { code: 'EUR', name: 'Euro', category: 'doviz', unit: 'adet', aliases: ['eur', 'euro'] },
  { code: 'GBP', name: 'İngiliz Sterlini', category: 'doviz', unit: 'adet', aliases: ['gbp', 'sterlin'] },
  { code: 'CHF', name: 'İsviçre Frangı', category: 'doviz', unit: 'adet', aliases: ['chf', 'frank'] },
];

/** Demo/başlangıç fiyatları (kaynak erişilemezse gösterilir, panelde "demo" uyarısıyla) */
export const DEMO_BASE = {
  HAS: [4840, 4875], GRAM: [4815, 4870], A22: [4380, 4545], A18: [3560, 3790], A14: [2740, 3010],
  CEYREK: [7820, 8010], YARIM: [15640, 16020], TAM: [31280, 31950], CUMHURIYET: [32150, 32700],
  ATA: [32200, 32900], RESAT: [32250, 33600], GREMSE: [78400, 80600], GUMUS: [55.1, 58.4],
  USD: [41.52, 41.68], EUR: [48.61, 48.84], GBP: [55.83, 56.2], CHF: [52.02, 52.4],
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** "4.850,12" / "%0,45" / 4850.12 → sayı */
export function parseTrNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[%\s₺$€]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Farklı kaynak biçimlerini {CODE: {buy, sell, change}} yapısına çevirir. */
export function normalizeSource(json) {
  const out = {};
  if (!json || typeof json !== 'object') return out;
  const entries = Object.entries(json.Rates || json.rates || json);
  const byKey = new Map(entries.map(([k, v]) => [norm(k), v]));
  for (const def of PRICE_DEFS) {
    for (const alias of [def.code, ...def.aliases]) {
      const v = byKey.get(norm(alias));
      if (v && typeof v === 'object') {
        const buy = parseTrNumber(v.Buying ?? v['Alış'] ?? v.alis ?? v.buy ?? v.Alis);
        const sell = parseTrNumber(v.Selling ?? v['Satış'] ?? v.satis ?? v.sell ?? v.Satis);
        const change = parseTrNumber(v.Change ?? v['Değişim'] ?? v.degisim ?? v.change);
        if (buy && sell) {
          out[def.code] = { buy, sell, change };
          break;
        }
      }
    }
  }
  // Eksik ayar fiyatlarını has altından türet
  const has = out.HAS || (out.GRAM && { buy: out.GRAM.buy, sell: out.GRAM.sell });
  if (has) {
    if (!out.HAS) out.HAS = { ...has, change: out.GRAM?.change ?? null };
    for (const def of PRICE_DEFS) {
      if (!out[def.code] && def.category === 'altin' && def.milyem) {
        out[def.code] = { buy: round2(has.buy * def.milyem), sell: round2(has.sell * def.milyem), change: out.HAS.change, derived: true };
      }
    }
  }
  return out;
}

export function applyMargin(item) {
  if (item.manual_active && item.manual_buy && item.manual_sell) {
    return { buy: item.manual_buy, sell: item.manual_sell };
  }
  if (!item.source_buy || !item.source_sell) return { buy: item.buy ?? null, sell: item.sell ?? null };
  const dec = item.code === 'GUMUS' || item.category === 'doviz' ? 4 : 2;
  const r = (n) => Math.round(n * 10 ** dec) / 10 ** dec;
  if (item.margin_type === 'fixed') {
    return { buy: r(item.source_buy - item.margin_buy), sell: r(item.source_sell + item.margin_sell) };
  }
  return { buy: r(item.source_buy * (1 - item.margin_buy / 100)), sell: r(item.source_sell * (1 + item.margin_sell / 100)) };
}

export function recomputeAll() {
  const ts = nowIso();
  tx(() => {
    for (const item of q.all('SELECT * FROM price_items')) {
      const { buy, sell } = applyMargin(item);
      q.run('UPDATE price_items SET buy = ?, sell = ?, updated_at = ? WHERE code = ?', buy, sell, ts, item.code);
    }
  });
  snapshotHistory();
  priceEvents.emit('update', publicPrices());
}

let lastSnapshot = 0;
function snapshotHistory(force = false) {
  const now = Date.now();
  if (!force && now - lastSnapshot < 10 * 60_000) return;
  lastSnapshot = now;
  const ts = nowIso();
  tx(() => {
    for (const r of q.all('SELECT code, buy, sell FROM price_items WHERE buy IS NOT NULL')) {
      q.run('INSERT INTO price_history(code, buy, sell, ts) VALUES (?,?,?,?)', r.code, r.buy, r.sell, ts);
    }
    q.run('DELETE FROM price_history WHERE ts < ?', isoAgo(400));
  });
}

export function storeSource(normalized, sourceTs = nowIso()) {
  tx(() => {
    for (const [code, v] of Object.entries(normalized)) {
      q.run('UPDATE price_items SET source_buy = ?, source_sell = ?, source_change = ?, source_updated_at = ? WHERE code = ?',
        v.buy, v.sell, v.change ?? null, sourceTs, code);
    }
  });
  recomputeAll();
}

export const status = { lastFetchAt: null, lastSuccessAt: null, lastError: null, mode: 'live' };

export async function fetchPrices() {
  status.lastFetchAt = nowIso();
  if (config.prices.simulate) {
    simulateTick();
    status.mode = 'demo';
    status.lastSuccessAt = nowIso();
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(config.prices.url, { signal: ctrl.signal, headers: { 'user-agent': 'DC-Kuyumcu-Takip/1.0' } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const normalized = normalizeSource(await res.json());
    if (!normalized.HAS) throw new Error('Kaynakta altın fiyatı bulunamadı');
    storeSource(normalized);
    status.mode = 'live';
    status.lastSuccessAt = nowIso();
    status.lastError = null;
  } catch (err) {
    status.lastError = String(err.message || err);
    status.mode = 'stale';
  }
}

/** Demo modu: gerçekçi küçük dalgalanmalar üretir */
export function simulateTick() {
  const current = Object.fromEntries(q.all('SELECT code, source_buy, source_sell FROM price_items').map((r) => [r.code, r]));
  const drift = 1 + (Math.random() - 0.5) * 0.002;
  const fx = 1 + (Math.random() - 0.5) * 0.0008;
  const out = {};
  for (const [code, [b, s]] of Object.entries(DEMO_BASE)) {
    const cur = current[code];
    const f = PRICE_DEFS.find((d) => d.code === code).category === 'doviz' ? fx : drift;
    const buy = (cur?.source_buy || b) * f;
    const sell = (cur?.source_sell || s) * f;
    // Aşırı sapmayı engelle (±%3)
    const clamp = (v, base) => Math.min(base * 1.03, Math.max(base * 0.97, v));
    const nb = clamp(buy, b), ns = clamp(sell, s);
    out[code] = { buy: round2(nb), sell: round2(ns), change: round2(((ns - s) / s) * 100) };
  }
  storeSource(out);
}

export function priceMap() {
  return Object.fromEntries(q.all('SELECT code, buy, sell FROM price_items').map((r) => [r.code, { buy: r.buy, sell: r.sell }]));
}

export function publicPrices() {
  const items = q.all(
    'SELECT code, name, category, unit, buy, sell, source_change AS change, updated_at FROM price_items WHERE show_on_site = 1 ORDER BY sort',
  );
  return { items, updatedAt: items.reduce((m, i) => (i.updated_at > m ? i.updated_at : m), ''), mode: status.mode };
}

let timer = null;
export function startPriceLoop() {
  if (timer || config.isTest) return;
  fetchPrices();
  timer = setInterval(fetchPrices, Math.max(15, config.prices.refreshSeconds) * 1000);
  timer.unref();
}
