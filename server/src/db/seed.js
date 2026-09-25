import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { q, tx, nextNo, nowIso } from './index.js';
import { config } from '../config.js';
import { ensureBaseData } from './base.js';
import { hashPassword } from '../security/password.js';
import { encrypt, blindIndex, maskTCKN } from '../security/crypto.js';
import { priceMap } from '../services/prices.js';
import { productPricing, milyemOf, round2, round3 } from '../lib/gold.js';

export const DEMO_PASSWORD = 'DcKuyumcu2026';

const DEMO_PRODUCTS = [
  // [ad, kategori, tür, ayar, gram, işçilik milyem, taş açıklaması, taş fiyatı, stok, öne çıkan, görsel, fiyat kodu]
  ['Tektaş Pırlanta Yüzük 0.30 ct', 'pirlanta', 'pirlanta', '14', 2.45, 0.2, '0.30 ct G-VS2 pırlanta', 38000, 1, 1, 'tektas'],
  ['Beştaş Pırlanta Yüzük', 'pirlanta', 'pirlanta', '14', 3.1, 0.2, '5 × 0.05 ct pırlanta', 21000, 1, 1, 'bestas'],
  ['Su Yolu Pırlanta Kolye', 'pirlanta', 'pirlanta', '14', 4.2, 0.25, '0.45 ct toplam pırlanta', 29500, 1, 0, 'kolye-pirlanta'],
  ['Klasik Alyans 4 mm', 'alyans', 'taki', '14', 4.5, 0.12, null, 0, 6, 1, 'alyans'],
  ['Kumlu Alyans 5 mm', 'alyans', 'taki', '14', 5.2, 0.12, null, 0, 4, 0, 'alyans'],
  ['Taşlı Alyans', 'alyans', 'taki', '14', 3.9, 0.15, 'Zirkon taş dizisi', 450, 3, 0, 'alyans'],
  ['Zirkon Taşlı Tria Yüzük', 'yuzuk', 'taki', '14', 2.8, 0.18, 'Zirkon', 300, 5, 1, 'yuzuk'],
  ['Mavi Taşlı Kadın Yüzüğü', 'yuzuk', 'taki', '14', 2.3, 0.18, 'Topaz', 650, 3, 0, 'yuzuk'],
  ['Erkek Şövalye Yüzük', 'yuzuk', 'taki', '14', 7.6, 0.12, null, 0, 2, 0, 'sovalye'],
  ['Burma Bilezik 22 Ayar', 'bilezik', 'taki', '22', 10.1, 0.03, null, 0, 12, 1, 'bilezik'],
  ['Adana Burma Bilezik', 'bilezik', 'taki', '22', 15.2, 0.03, null, 0, 6, 0, 'bilezik'],
  ['Trabzon Hasırı Bilezik', 'bilezik', 'taki', '22', 20.5, 0.05, null, 0, 3, 1, 'hasir'],
  ['Mega Ajda Bilezik', 'bilezik', 'taki', '22', 8.2, 0.025, null, 0, 20, 0, 'bilezik'],
  ['Kelebek Kolye', 'kolye', 'taki', '14', 2.1, 0.2, 'Zirkon', 150, 7, 1, 'kolye'],
  ['Harf Kolye', 'kolye', 'taki', '14', 1.6, 0.22, null, 0, 15, 0, 'kolye'],
  ['Sonsuzluk Kolye', 'kolye', 'taki', '14', 1.9, 0.2, 'Zirkon', 100, 8, 0, 'kolye'],
  ['Gurmet Zincir 50 cm', 'kolye', 'taki', '22', 12.4, 0.04, null, 0, 4, 0, 'zincir'],
  ['Tenis Bileklik', 'bileklik', 'taki', '14', 6.3, 0.25, 'Zirkon dizili', 900, 3, 1, 'bileklik'],
  ['Kalpli Bileklik', 'bileklik', 'taki', '14', 2.7, 0.2, null, 0, 6, 0, 'bileklik'],
  ['Çift Sıra Bileklik', 'bileklik', 'taki', '14', 3.4, 0.2, null, 0, 5, 0, 'bileklik'],
  ['Halka Küpe', 'kupe', 'taki', '14', 2.2, 0.2, null, 0, 9, 0, 'kupe'],
  ['Damla Taşlı Küpe', 'kupe', 'taki', '14', 2.9, 0.22, 'Zümrüt renkli taş', 400, 4, 1, 'kupe'],
  ['Gelin Seti (Kolye + Küpe + Bileklik)', 'set', 'taki', '22', 38.5, 0.08, null, 0, 1, 1, 'set'],
  ['Mini Set 14 Ayar', 'set', 'taki', '14', 9.8, 0.2, 'Zirkon', 500, 2, 0, 'set'],
  ['Çeyrek Altın', 'ziynet', 'sarrafiye', '22', 1.75, 0, null, 0, 60, 1, 'ceyrek', 'CEYREK'],
  ['Yarım Altın', 'ziynet', 'sarrafiye', '22', 3.5, 0, null, 0, 25, 0, 'ceyrek', 'YARIM'],
  ['Tam Altın', 'ziynet', 'sarrafiye', '22', 7.0, 0, null, 0, 12, 0, 'ceyrek', 'TAM'],
  ['Cumhuriyet Altını', 'ziynet', 'sarrafiye', '22', 7.216, 0, null, 0, 8, 0, 'ceyrek', 'CUMHURIYET'],
  ['Ata Lira', 'ziynet', 'sarrafiye', '22', 7.216, 0, null, 0, 6, 0, 'ceyrek', 'ATA'],
  ['Gram Altın 1 gr (Sertifikalı)', 'ziynet', 'sarrafiye', '24', 1, 0, null, 0, 40, 0, 'gram', 'GRAM'],
  ['925 Ayar Gümüş Kolye', 'gumus', 'gumus', '925', 4.5, 0.6, 'Zirkon', 0, 12, 0, 'kolye'],
  ['925 Ayar Gümüş Bileklik', 'gumus', 'gumus', '925', 7.2, 0.6, null, 0, 9, 0, 'bileklik'],
];

const DEMO_CUSTOMERS = [
  ['Ayşe Yılmaz', '05321112233', '10000000146', '1978-10-02', '2002-06-15', 'Düzenli müşteri, bilezik sever'],
  ['Mehmet Demir', '05334445566', null, '1985-09-27', '2012-09-29', 'Düğün takısı için geldi'],
  ['Fatma Kaya', '05057778899', null, '1990-01-11', null, null],
  ['Ali Çelik', '05441234567', null, null, '2020-05-20', 'Toptan çeyrek alıyor'],
  ['Zeynep Arslan', '05559876543', null, '1995-09-29', null, 'Pırlanta ile ilgileniyor'],
  ['Hasan Öztürk', '05312223344', null, null, null, 'Hurda altın getiriyor'],
];

export async function seedDemo() {
  ensureBaseData();
  if (q.get('SELECT 1 FROM products LIMIT 1')) return { skipped: true };
  const pw = await hashPassword(DEMO_PASSWORD);
  const ts = nowIso();
  tx(() => {
    const staff = [
      ['Kemal Usta', '05320000001', 'Atölye Ustası', 32000, 0],
      ['Elif Hanım', '05320000002', 'Satış Sorumlusu', 30000, 1],
      ['Burak Bey', '05320000003', 'Satış Danışmanı', 28000, 1],
      ['Selin Hanım', '05320000004', 'Muhasebe', 30000, 0],
    ].map(([n, p, pos, sal, com]) =>
      q.run('INSERT INTO staff(full_name, phone, position, salary, commission_pct, start_date) VALUES (?,?,?,?,?,?)', n, p, pos, sal, com, '2020-01-01').lastInsertRowid);

    const users = [
      ['patron', 'Patron (Demo)', 'owner', null],
      ['mudur', 'Müdür (Demo)', 'manager', null],
      ['satis', 'Elif Hanım', 'sales', staff[1]],
      ['muhasebe', 'Selin Hanım', 'accountant', staff[3]],
      ['atolye', 'Kemal Usta', 'workshop', staff[0]],
    ];
    for (const [u, n, r, s] of users) {
      q.run('INSERT OR IGNORE INTO users(username, full_name, role, password_hash, staff_id, password_changed_at) VALUES (?,?,?,?,?,?)', u, n, r, pw, s, ts);
    }

    const sup1 = q.run('INSERT INTO suppliers(name, contact, phone, address) VALUES (?,?,?,?)', 'Kapalıçarşı Toptan Altın A.Ş. (Demo)', 'Murat Bey', '02120000000', 'Kapalıçarşı / İstanbul').lastInsertRowid;
    q.run('INSERT INTO suppliers(name, contact, phone, address) VALUES (?,?,?,?)', 'Ankara Pırlanta Atölyesi (Demo)', 'Serkan Bey', '03120000000', 'Ulus / Ankara');

    const cats = Object.fromEntries(q.all('SELECT id, slug FROM categories').map((c) => [c.slug, c.id]));
    let i = 0;
    for (const [name, cat, kind, karat, gram, lm, stone, stonePrice, stock, featured, img, code] of DEMO_PRODUCTS) {
      i++;
      const milyem = milyemOf(karat);
      const costHas = round3(gram * (milyem + (kind === 'sarrafiye' ? 0 : lm * 0.45)));
      q.run(
        `INSERT INTO products(sku, barcode, name, category_id, kind, karat, milyem, gram, labor_milyem, stone_desc, stone_price, price_code,
         cost_has, cost_tl, supplier_id, stock_qty, min_stock, location, description, image, featured)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `DC-${String(i).padStart(4, '0')}`, `869${String(100000000 + i * 7919).slice(0, 9)}${i % 10}`, name, cats[cat], kind, karat, milyem, gram, lm,
        stone, stonePrice, code || null, kind === 'gumus' ? 0 : costHas, kind === 'gumus' ? round2(gram * 40) : round2(stonePrice * 0.7), sup1,
        stock, kind === 'sarrafiye' ? 10 : 1, kind === 'sarrafiye' ? 'Kasa' : 'Vitrin', [`${karat} ayar, ${gram} gram.`, stone && `Taş: ${stone}.`, 'Faturalı ve garantili.'].filter(Boolean).join(' '),
        `/img/urun/${img}.svg`, featured,
      );
    }

    for (const [n, p, tc, bd, ad, note] of DEMO_CUSTOMERS) {
      q.run(
        `INSERT INTO customers(full_name, phone, tckn_enc, tckn_index, tckn_masked, birth_date, anniversary_date, notes, kvkk_consent, kvkk_consent_at, marketing_consent)
         VALUES (?,?,?,?,?,?,?,?,1,?,1)`, n, p, encrypt(tc), blindIndex(tc), maskTCKN(tc), bd, ad, note, ts,
      );
    }

    // Açılış kasası (devir)
    const open = [['TRY', 250000, 1], ['USD', 3000, 41.6], ['EUR', 1500, 48.7], ['HAS', 120, 4850]];
    for (const [cur, amt, rate] of open) {
      q.run(`INSERT INTO cash_movements(ts, direction, account, currency, amount, rate, amount_try, category, description, user_id)
             VALUES (?,?,?,?,?,?,?,?,?,1)`, new Date(Date.now() - 20 * 86400_000).toISOString(), 'in', 'kasa', cur, amt, rate, round2(amt * rate), 'devir', 'Açılış bakiyesi');
    }
    q.run(`INSERT INTO cash_movements(ts, direction, account, currency, amount, rate, amount_try, category, description, user_id)
           VALUES (?,?,?,?,?,?,?,?,?,1)`, new Date(Date.now() - 20 * 86400_000).toISOString(), 'in', 'banka', 'TRY', 420000, 1, 420000, 'devir', 'Açılış bakiyesi');
    q.run('INSERT INTO supplier_ledger(ts, supplier_id, type, currency, amount, note, user_id) VALUES (?,?,?,?,?,?,1)', ts, sup1, 'devir', 'HAS', 85.5, 'Önceki dönemden has borç');

    // Son 14 günün örnek satışları
    const prices = priceMap();
    const products = q.all('SELECT * FROM products');
    const customers = q.all('SELECT id FROM customers');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let d = 13; d >= 0; d--) {
      const count = 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < count; k++) {
        const p = products[Math.floor(rnd() * products.length)];
        const qty = p.kind === 'sarrafiye' ? 1 + Math.floor(rnd() * 3) : 1;
        const pr = productPricing(p, prices, 5);
        const total = round2(pr.unit * qty);
        const day = new Date(Date.now() - d * 86400_000);
        day.setHours(10 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
        const staffId = rnd() > 0.5 ? staff[1] : staff[2];
        const custId = rnd() > 0.4 ? customers[Math.floor(rnd() * customers.length)].id : null;
        const cost = round2(qty * (p.cost_has * prices.HAS.sell + p.cost_tl));
        const saleId = q.run(
          `INSERT INTO sales(no, ts, customer_id, user_id, staff_id, subtotal, total, has_total, cost_total, paid_total) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          nextNo('S'), day.toISOString(), custId, 3, staffId, total, total, round3(pr.has * qty), cost, total,
        ).lastInsertRowid;
        q.run(`INSERT INTO sale_items(sale_id, product_id, description, qty, karat, milyem, gram, unit_price, total, has_equivalent, labor_amount, cost_estimate)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, saleId, p.id, p.name, qty, p.karat, p.milyem, p.gram, pr.unit, total, round3(pr.has * qty), round2(pr.labor * qty), cost);
        const method = rnd() > 0.45 ? ['kasa', 'nakit'] : ['pos', 'kart'];
        q.run(`INSERT INTO cash_movements(ts, direction, account, currency, amount, rate, amount_try, category, ref_type, ref_id, description, user_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,3)`, day.toISOString(), 'in', method[0], 'TRY', total, 1, total, 'satis', 'sale', saleId, `Satış (${method[1]})`);
      }
    }

    // Giderler
    const expenses = [['kira', 45000, 'Dükkân kirası'], ['elektrik', 3200, 'Elektrik faturası'], ['guvenlik', 2500, 'Alarm & kamera hizmeti'], ['vergi', 18000, 'KDV ödemesi']];
    for (const [cat, amt, desc] of expenses) {
      q.run(`INSERT INTO cash_movements(ts, direction, account, currency, amount, rate, amount_try, category, description, user_id)
             VALUES (?,?,?,?,?,?,?,?,?,1)`, new Date(Date.now() - 5 * 86400_000).toISOString(), 'out', 'banka', 'TRY', amt, 1, amt, cat, desc);
    }

    // Tamir & siparişler
    const cIds = customers.map((c) => c.id);
    const repairs = [
      ['tamir', cIds[0], 'Burma bilezik — kopuk halka', '22', 10.2, 'Lehim ve cila', 350, 0, 2, 'atolyede'],
      ['boy', cIds[1], 'Alyans boy büyütme (14 → 16)', '14', 4.4, '2 numara büyütme', 600, 200, 1, 'alindi'],
      ['siparis', cIds[4], 'İsimli kolye — "Defne"', '14', null, 'Özel tasarım, el yazısı font', 5200, 2000, 5, 'atolyede'],
      ['temizlik', cIds[2], 'Pırlanta yüzük cila + taş kontrol', '14', 2.5, null, 250, 0, 0, 'hazir'],
    ];
    for (const [kind, cid, item, karat, gram, issue, est, dep, dueIn, st] of repairs) {
      const due = new Date(Date.now() + dueIn * 86400_000).toISOString().slice(0, 10);
      q.run(`INSERT INTO repairs(no, kind, customer_id, item_desc, karat, gram_in, issue, estimated_price, deposit, due_date, status, assigned_staff_id, created_at, updated_at, user_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,3)`, nextNo('T'), kind, cid, item, karat, gram, issue, est, dep, due, st, staff[0], ts, ts);
    }

    q.run('INSERT INTO customer_ledger(ts, customer_id, type, currency, amount, note, user_id) VALUES (?,?,?,?,?,?,1)', ts, cIds[3], 'veresiye', 'HAS', 5.25, 'Çeyrek alımı — gram hesabı');
    q.run('INSERT INTO customer_ledger(ts, customer_id, type, currency, amount, note, user_id) VALUES (?,?,?,?,?,?,1)', ts, cIds[1], 'veresiye', 'TRY', 12500, 'Düğün takısı kalan');

    q.run('INSERT INTO inquiries(ts, name, phone, message, product_id) VALUES (?,?,?,?,?)', ts, 'Gizem T.', '05330000000', 'Tektaş yüzüğün 12 numarası var mı?', 1);
  });
  return { created: true };
}

/** Üretim kurulumu: rastgele güçlü parola ile patron hesabı */
export async function seedOwner(username = 'patron') {
  ensureBaseData();
  if (q.get('SELECT 1 FROM users LIMIT 1')) return null;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  q.run('INSERT INTO users(username, full_name, role, password_hash, must_change_password, password_changed_at) VALUES (?,?,?,?,1,?)',
    username, 'Patron', 'owner', await hashPassword(password), nowIso());
  return { username, password };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const demo = process.argv.includes('--demo');
  if (demo) {
    await seedDemo();
    console.log(`Demo verisi yüklendi. Kullanıcılar: patron, mudur, satis, muhasebe, atolye — parola: ${DEMO_PASSWORD}`);
    console.log('UYARI: Demo parolaları yalnızca tanıtım içindir. Gerçek kullanımda --demo kullanmayın.');
  } else {
    const r = await seedOwner();
    if (r) {
      const file = path.join(config.dataDir, 'ILK_GIRIS.txt');
      fs.writeFileSync(file, `Kullanıcı: ${r.username}\nGeçici parola: ${r.password}\nİlk girişte parolanızı değiştirmeniz istenecek. Bu dosyayı okuduktan sonra silin.\n`, { mode: 0o600 });
      console.log(`Patron hesabı oluşturuldu. Geçici parola ${file} dosyasına yazıldı.`);
    } else {
      console.log('Kullanıcılar zaten mevcut; değişiklik yapılmadı.');
    }
  }
}
