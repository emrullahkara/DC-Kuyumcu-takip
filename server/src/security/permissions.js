/**
 * Rol tabanlı yetki matrisi. r = görüntüleme, w = işlem yapma.
 * Kuyumcu işleyişine göre: tezgâhtar kasa bakiyesini ve raporları göremez,
 * atölye ustası yalnızca tamir/sipariş işlerini yönetir.
 */
export const ROLES = {
  owner: 'Patron',
  manager: 'Müdür',
  sales: 'Satış Personeli',
  accountant: 'Muhasebe',
  workshop: 'Atölye Ustası',
};

export const MODULES = {
  dashboard: 'Gösterge Paneli',
  prices: 'Fiyat & Kur',
  products: 'Ürün & Stok',
  sales: 'Satış',
  purchases: 'Alış / Bozdurma',
  customers: 'Müşteriler',
  suppliers: 'Tedarikçiler',
  repairs: 'Tamir & Sipariş',
  cash: 'Kasa & Gelir-Gider',
  staff: 'Personel',
  reports: 'Raporlar',
  site: 'Web Sitesi',
  inquiries: 'Web Talepleri',
  users: 'Kullanıcılar',
  audit: 'Denetim Kaydı',
  settings: 'Ayarlar',
};

const MATRIX = {
  owner: Object.fromEntries(Object.keys(MODULES).map((m) => [m, 'w'])),
  manager: {
    dashboard: 'w', prices: 'w', products: 'w', sales: 'w', purchases: 'w', customers: 'w', suppliers: 'w',
    repairs: 'w', cash: 'w', staff: 'w', reports: 'r', site: 'w', inquiries: 'w', users: 'r', audit: 'r', settings: 'r',
  },
  sales: {
    dashboard: 'r', prices: 'r', products: 'r', sales: 'w', purchases: 'w', customers: 'w', repairs: 'w', inquiries: 'w',
  },
  accountant: {
    dashboard: 'r', prices: 'r', products: 'r', sales: 'r', purchases: 'r', customers: 'r', suppliers: 'w',
    repairs: 'r', cash: 'w', staff: 'w', reports: 'r',
  },
  workshop: {
    dashboard: 'r', prices: 'r', products: 'r', customers: 'r', repairs: 'w',
  },
};

export function can(role, module, level = 'r') {
  const p = MATRIX[role]?.[module];
  if (!p) return false;
  return level === 'r' ? true : p === 'w';
}

export function permissionsFor(role) {
  return { ...(MATRIX[role] || {}) };
}
