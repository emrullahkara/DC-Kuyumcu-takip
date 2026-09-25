const tl = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tl0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const n3 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const n2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const money = (v, digits = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : `${(digits === 0 ? tl0 : tl).format(Number(v))} ₺`);
export const num = (v) => (v === null || v === undefined ? '—' : n2.format(Number(v)));
export const gram = (v) => (v === null || v === undefined ? '—' : `${n3.format(Number(v))} gr`);
export const has = (v) => (v === null || v === undefined ? '—' : `${n3.format(Number(v))} gr has`);
export const price = (v, code) => {
  if (v === null || v === undefined) return '—';
  const digits = ['USD', 'EUR', 'GBP', 'CHF', 'GUMUS'].includes(code) ? 4 : 2;
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(v);
};
export const CUR = { TRY: '₺', USD: '$', EUR: '€', GBP: '£', HAS: 'gr has' };
export const curAmount = (v, c) => (c === 'HAS' ? has(v) : c === 'TRY' ? money(v) : `${n2.format(v)} ${CUR[c] || c}`);

export const date = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '—');
export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const KARATS = ['24', '22', '21', '18', '14', '10', '8', '925'];
export const KARAT_MILYEM = { 24: 0.995, 22: 0.916, 21: 0.875, 18: 0.75, 14: 0.585, 10: 0.417, 8: 0.333, 925: 0.925 };
export const KIND_LABEL = { taki: 'Takı', sarrafiye: 'Sarrafiye', pirlanta: 'Pırlanta', gumus: 'Gümüş', saat: 'Saat', diger: 'Diğer' };
export const METHOD_LABEL = { nakit: 'Nakit', kart: 'Kredi Kartı', havale: 'Havale/EFT', doviz: 'Döviz', altin: 'Eski Altın (Takas)', veresiye: 'Veresiye', cari: 'Cariye Yaz' };
export const ACCOUNT_LABEL = { kasa: 'Kasa', banka: 'Banka', pos: 'POS' };
export const REPAIR_STATUS = { alindi: ['Teslim alındı', 'blue'], atolyede: ['Atölyede', 'amber'], hazir: ['Hazır', 'green'], teslim: ['Teslim edildi', ''], iptal: ['İptal', 'red'] };
export const REPAIR_KIND = { tamir: 'Tamir', siparis: 'Özel sipariş', boy: 'Boy ayarı', temizlik: 'Temizlik / Cila', kaplama: 'Kaplama', diger: 'Diğer' };

/** Türk telefonu → WhatsApp bağlantısı */
export function waLink(phone, text = '') {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  if (d.length === 10) d = `90${d}`;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export const telLink = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
