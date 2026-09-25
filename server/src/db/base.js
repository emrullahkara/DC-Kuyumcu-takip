import { q, tx, getSetting, setSetting } from './index.js';
import { PRICE_DEFS, DEMO_BASE, storeSource } from '../services/prices.js';

export const DEFAULT_BUSINESS = {
  identity_threshold_try: 185000,     // MASAK kimlik tespiti eşiği (güncel tutarı mevzuattan kontrol edin)
  max_discount_pct_sales: 3,          // Satış personelinin yapabileceği en yüksek indirim (%)
  price_rounding: 5,                  // Etiket fiyatı yukarı yuvarlama adımı (TL)
  default_fire_pct: 0,                // Hurda alımında varsayılan fire (%)
  require_2fa_roles: [],              // Örn. ["owner","manager"] — bu roller 2FA olmadan giriş yapamaz
  cancel_roles: ['owner', 'manager'], // Satış iptal edebilecek roller
  receipt_footer: 'Bizi tercih ettiğiniz için teşekkür ederiz.',
};

export const DEFAULT_SITE = {
  name: 'DC Kuyumculuk',
  slogan: '1985\'ten beri Ankara\'nın güvenilir kuyumcusu',
  founded_year: 1985,
  phone: '0312 000 00 00',
  whatsapp: '905000000000',
  email: 'info@ornek-kuyumcu.com',
  instagram: 'ornekkuyumcu',
  facebook: '',
  address: 'Anafartalar Cad. No:1, Ulus / Altındağ / Ankara',
  map_query: 'Ulus, Altındağ, Ankara',
  hours: [
    { day: 'Pazartesi – Cumartesi', time: '09:00 – 19:30' },
    { day: 'Pazar', time: 'Kapalı' },
  ],
  about_title: 'Kırk yıllık emek, üç kuşaklık güven',
  about_text:
    '1985 yılında Ulus\'ta küçük bir tezgâhta başlayan yolculuğumuz, bugün üç kuşağın emeği ve binlerce ailenin güveniyle sürüyor. ' +
    'Nişan yüzüğünden düğün takısına, çocuğunuzun ilk çeyreğinden yıllara meydan okuyan bileziklere kadar her parçayı ayarına, gramına ve işçiliğine titizlikle bakarak sunuyoruz.\n\n' +
    'Tüm ürünlerimiz ayar damgalı, faturalı ve garantilidir. Eski altınlarınızı güncel has fiyatından, şeffaf fire oranıyla değerlendiriyor; tamir, boy ayarı ve özel sipariş işlerinizi kendi atölyemizde yapıyoruz.',
  values: [
    { title: 'Ayar Garantisi', text: 'Her ürün damgalı ve faturalı; ayarını ölçüp gösteririz.' },
    { title: 'Şeffaf Fiyat', text: 'Fiyatlar anlık has altın kuruna göre, işçilik ayrı yazılır.' },
    { title: 'Kendi Atölyemiz', text: 'Tamir, boy ayarı, taş yenileme ve özel tasarım.' },
    { title: 'Güvenli Alım-Satım', text: 'Eski altınınız terazide, gözünüzün önünde değerlenir.' },
  ],
  hero_title: 'Altının en saf hâli, güvenin en eski adresi',
  hero_text: 'Anlık altın fiyatları, yeni sezon takılar ve ustalıkla işlenmiş pırlantalar.',
  show_prices: ['HAS', 'GRAM', 'A22', 'A14', 'CEYREK', 'YARIM', 'TAM', 'CUMHURIYET', 'ATA', 'GUMUS', 'USD', 'EUR'],
  price_note: 'Fiyatlar bilgi amaçlıdır; kesin fiyat için mağazamızı arayınız.',
  theme: 'gold',
};

export const DEFAULT_CATEGORIES = [
  ['Yüzük', 'yuzuk', 'ring'], ['Alyans', 'alyans', 'alyans'], ['Pırlanta', 'pirlanta', 'diamond'],
  ['Kolye', 'kolye', 'necklace'], ['Bileklik', 'bileklik', 'bracelet'], ['Bilezik', 'bilezik', 'bangle'],
  ['Küpe', 'kupe', 'earring'], ['Set', 'set', 'set'], ['Ziynet & Sarrafiye', 'ziynet', 'coin'], ['Gümüş', 'gumus', 'silver'],
];

const DEFAULT_MARGINS = {
  HAS: [0.3, 0.3], GRAM: [0.5, 0.5], A22: [0.5, 1], A18: [1, 1], A14: [1, 1], CEYREK: [0.5, 0.8], YARIM: [0.5, 0.8],
  TAM: [0.5, 0.8], CUMHURIYET: [0.5, 0.8], ATA: [0.5, 0.8], RESAT: [0.5, 1], GREMSE: [0.5, 1], GUMUS: [2, 2],
  USD: [0.1, 0.1], EUR: [0.1, 0.1], GBP: [0.2, 0.2], CHF: [0.2, 0.2],
};

/** Temel veriler — idempotent, her açılışta güvenle çalıştırılır */
export function ensureBaseData() {
  tx(() => {
    PRICE_DEFS.forEach((d, i) => {
      const [mb, ms] = DEFAULT_MARGINS[d.code] || [0, 0];
      q.run(
        `INSERT INTO price_items(code, name, category, unit, milyem, sort, margin_buy, margin_sell) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(code) DO NOTHING`,
        d.code, d.name, d.category, d.unit, d.milyem ?? null, i, mb, ms,
      );
    });
    if (!getSetting('business')) setSetting('business', DEFAULT_BUSINESS);
    else setSetting('business', { ...DEFAULT_BUSINESS, ...getSetting('business') });
    if (!getSetting('site')) setSetting('site', DEFAULT_SITE);
    if (!q.get('SELECT 1 FROM categories LIMIT 1')) {
      DEFAULT_CATEGORIES.forEach(([name, slug, icon], i) => q.run('INSERT INTO categories(name, slug, icon, sort) VALUES (?,?,?,?)', name, slug, icon, i));
    }
  });
  // Hiç fiyat yoksa başlangıç fiyatlarını yükle (kaynak gelince üzerine yazılır)
  if (!q.get('SELECT 1 FROM price_items WHERE source_buy IS NOT NULL LIMIT 1')) {
    storeSource(Object.fromEntries(Object.entries(DEMO_BASE).map(([c, [buy, sell]]) => [c, { buy, sell, change: 0 }])), '1970-01-01T00:00:00.000Z');
  }
}
