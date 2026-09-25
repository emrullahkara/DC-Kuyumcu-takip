# DC Kuyumcu Takip — Tanıtım Sunumu

> "Dükkânınız cebinizde, altınınız güvende."

Bu doküman, sistemi bir kuyumcuya veya teknik olmayan bir karar vericiye baştan sona, en ince ayrıntısına kadar anlatmak için hazırlanmıştır. Hızlı özet için kök dizindeki `README.md`, kod detayları için `server/` ve `client/` altındaki kaynaklar incelenebilir.

---

## İçindekiler

1. [Sistem ne yapar, kime hitap eder?](#1-sistem-ne-yapar-kime-hitap-eder)
2. [Mimari genel bakış](#2-mimari-genel-bakış)
3. [Web sitesi — müşterinin gördüğü taraf](#3-web-sitesi--müşterinin-gördüğü-taraf)
4. [Yönetim paneli — dükkânın gördüğü taraf](#4-yönetim-paneli--dükkânın-gördüğü-taraf)
5. [Canlı fiyat motoru](#5-canlı-fiyat-motoru)
6. [Kuyumculuk hesap kuralları (formüller)](#6-kuyumculuk-hesap-kuralları-formüller)
7. [Roller ve yetkilendirme](#7-roller-ve-yetkilendirme)
8. [Güvenlik mimarisi](#8-güvenlik-mimarisi)
9. [Veri modeli özeti](#9-veri-modeli-özeti)
10. [PWA — telefona kurulum](#10-pwa--telefona-kurulum)
11. [Kurulum ve dağıtım](#11-kurulum-ve-dağıtım)
12. [Test ve kalite güvencesi](#12-test-ve-kalite-güvencesi)
13. [Proje dosya yapısı](#13-proje-dosya-yapısı)
14. [Kuyumcuya satış konuşması](#14-kuyumcuya-satış-konuşması)

---

## 1. Sistem ne yapar, kime hitap eder?

DC Kuyumcu Takip, bir kuyumcu dükkânının **tüm dijital ihtiyacını tek bir sistemde** birleştirir:

- Müşterinin gördüğü bir **kurumsal web sitesi** (canlı fiyat, ürün vitrini, iletişim)
- Dükkânın günlük işlerini yürüttüğü bir **yönetim paneli** (satış, alış, kasa, cari, stok, personel, rapor)
- Panelin **telefona uygulama gibi kurulabilen** PWA sürümü

Hepsi **aynı veritabanını ve aynı sunucuyu** kullanır. Panelde bir ürünün fiyatı ya da stoğu değiştiğinde, web sitesinde de anında yansır — ayrı bir senkronizasyon, dışa aktarma veya "siteyi güncelle" adımı yoktur.

Hedef kitle: 1-15 çalışanlı, tek ya da az şubeli kuyumcu işletmeleri. Muhasebe programı yerine değil, **onun yanında** — günlük operasyonu (satış fişi, kasa, cari, stok) dijitalleştirmek ve haftalarca sürecek yazılım kurulumunu tek komuta indirmek için tasarlanmıştır.

---

## 2. Mimari genel bakış

```
┌─────────────────────────────┐        ┌───────────────────────────┐
│   Tarayıcı / Telefon (PWA)   │  HTTPS │      Node.js sunucusu      │
│  React + Vite tek sayfa uyg. │ ───────▶  Express API + statik dosya │
│  - Web sitesi (public)       │        │  - node:sqlite (dosya DB)  │
│  - Yönetim paneli (/panel)   │ ◀────── │  - Sunucu taraflı fiyat    │
└─────────────────────────────┘  SSE    │    hesaplama ve iş kuralı  │
                                          └───────────────────────────┘
                                                     │
                                          data/app.db (SQLite dosyası)
```

- **Backend:** Node.js 22 + Express, veritabanı olarak Node'un yerleşik `node:sqlite` modülü (ayrı bir veritabanı sunucusu kurulmasına gerek yok). Tek bir `data/app.db` dosyası tüm veriyi tutar.
- **Frontend:** React 18 + Vite. Tek bir derleme (build) hem web sitesini hem paneli üretir; sunucu bu statik dosyaları da servis eder. Yani **tek süreç, tek port, tek Docker imajı**.
- **Gerçek zamanlılık:** Fiyatlar Server-Sent Events (SSE) ile anlık yayınlanır — sayfa yenilemeden hem sitede hem panelde fiyat değişir.
- **Otorite her zaman sunucudadır:** Fiyat hesaplama, indirim sınırı, yetki kontrolü, MASAK eşiği gibi tüm iş kuralları sunucu tarafında uygulanır; istemciden (tarayıcıdan) gelen hiçbir fiyat veya yetki bilgisine güvenilmez.

---

## 3. Web sitesi — müşterinin gördüğü taraf

`client/src/site/` altında 12 sayfa/bileşenden oluşur:

| Dosya | Sayfa | İçerik |
|---|---|---|
| `Home.jsx` | Ana sayfa | Logo, kayan canlı fiyat bandı, fiyat kartları (has/gram/22 ayar/çeyrek/yarım/tam/dolar/euro), koleksiyonlar, öne çıkan ürünler, "Neden biz?" değerleri, hakkımızda özeti + galeri, harita, WhatsApp/ara butonu |
| `Products.jsx` | Ürünlerimiz | Kategori filtresi (yüzük, alyans, pırlanta, kolye, bileklik, bilezik, küpe, set, ziynet, gümüş), ayar filtresi, sıralama, arama, grid/liste görünümü |
| `ProductDetail.jsx` | Ürün detayı | Görsel, ayar/gram/taş bilgisi, **anlık has fiyatından hesaplanan güncel fiyat**, "WhatsApp ile sor", "Hemen ara", "Beni arayın" formu, benzer ürünler |
| `Prices.jsx` | Altın Fiyatları | Altın, sarrafiye, gümüş, döviz gruplu tablo; alış/satış/değişim %; SSE ile canlı güncelleme |
| `Calculator.jsx` | Altın Hesapla | Ayar + gram → has ve TL bozdurma değeri; çeyrek/ziynet adedi → TL değeri |
| `About.jsx`, `Contact.jsx`, `Kvkk.jsx` | Kurumsal | Firma hikâyesi, iletişim bilgileri + harita, KVKK aydınlatma metni |
| `SiteLayout.jsx` | Ortak yerleşim | Üst menü, alt bilgi (footer), sağ altta sabit WhatsApp düğmesi |
| `InquiryForm.jsx` | Talep formu | Bot tuzağı (honeypot) + KVKK onayı zorunlu; panelde "Web Talepleri" olarak düşer |

Tüm site içeriği (logo, firma bilgisi, çalışma saatleri, galeri, hangi fiyatların gösterileceği) panelden yönetilir — kod değişikliği gerektirmez.

---

## 4. Yönetim paneli — dükkânın gördüğü taraf

`client/src/admin/pages/` altında 21 ekran. Her ekran, ilgili API rotasına (`server/src/routes/`) karşılık gelir.

| Ekran (dosya) | Modül | Ne işe yarar? |
|---|---|---|
| `Dashboard.jsx` | Gösterge Paneli | Selamlama, hızlı işlem düğmeleri (Satış/Hurda/Tamir), mesai giriş-çıkış, canlı fiyat kutucukları, günün satış/alış istatistiği, kasa bakiyeleri (TL/döviz/has), 14 günlük satış grafiği, düşük stok uyarısı, doğum günü/yıldönümü hatırlatması, yeni web talepleri, son satışlar |
| `Prices.jsx` | Fiyat & Kur | Kaynak durumu (canlı/bayat/demo), yenile düğmesi, her kalem için alış-satış makası (% veya sabit TL), elle sabitleme, sitede gösterme anahtarı, fiyat geçmişi grafiği (1/7/30/90 gün), hızlı ayar+gram hesaplayıcı |
| `Pos.jsx` | Hızlı Satış (POS) | Barkod okuma, sepet, müşteri seçimi, indirim (rol bazlı sınır), **çoklu ödeme satırı**: nakit / kart / havale / döviz / eski altın takası / veresiye (TL ya da gram), fiş yazdırma, WhatsApp ile fiş gönderme |
| `Sales.jsx`, `SaleDetail.jsx` | Satışlar | Satış listesi ve filtreleri, satış detay/fiş görünümü, yetkili rollerce iptal (iz bırakarak — kayıt silinmez) |
| `Purchases.jsx` | Alış & Bozdurma | Hurda altın alımı (ayar, gram, fire %), sarrafiye geri alımı, toptancıdan mal alımı (tedarikçi carisine has olarak işlenir) |
| `Repairs.jsx` | Tamir & Sipariş | İş emri oluşturma, kapora, durum akışı: *alındı → atölyede → hazır → teslim edildi / iptal*, usta atama, "işiniz hazır" WhatsApp mesajı |
| `Products.jsx` | Ürünler & Stok | Ayar, milyem, gram, işçilik milyemi, taş, maliyet (has), konum, görsel; stok giriş/çıkış/sayım; barkod etiketi basma; stoğun toplam has değeri |
| `Customers.jsx`, `CustomerDetail.jsx` | Müşteriler | Cari (TL + gram has + döviz), tahsilat/ödeme/emanet kaydı, alış-satış-tamir geçmişi, şifreli TC kimlik no (sadece patron/müdür görebilir, her görüntüleme loglanır), KVKK anonimleştirme, doğum günü/yıldönümü hatırlatmaları |
| `Suppliers.jsx` | Tedarikçiler | Toptancıyla has ve TL cari, ödeme kaydı |
| `Cash.jsx` | Kasa & Gelir-Gider | 4 sekme: **Bakiyeler** (kasa/banka/POS × TL/USD/EUR/GBP/has), **Hareketler** (6 filtre), **Gider/Gelir ekle** (elle kayıt), **Döviz bozdur** ve **virman**, **Gün sonu** (beklenen vs sayılan tutar karşılaştırması, fark raporu, kapanış onayı) |
| `Reports.jsx` | Raporlar | Tarih aralığı seçimi, satış/brüt kâr/net kâr (TL ve has), kategori/ödeme türü/gider kalemi kırılımı, personel performansı, en çok satan ürünler, yazdırılabilir çıktı |
| `Staff.jsx` | Personel | Maaş, prim oranı, avans/kesinti, aylık bordro özeti, mesai takip, satış performansı |
| `SiteAdmin.jsx` | Web Sitesi Yönetimi | Firma bilgileri, logo/galeri/vitrin görselleri, çalışma saatleri, sitede gösterilecek fiyat kalemleri seçimi |
| `Inquiries.jsx` | Web Talepleri | Siteden gelen "beni arayın" talepleri; durum takibi (yeni/arandı/kapandı), tek tıkla ara/WhatsApp |
| `Users.jsx` | Kullanıcılar | 5 rol × 16 modül yetki tablosu, kullanıcı ekleme (geçici parola), parola sıfırlama, 2FA durumu, oturum kapatma |
| `Audit.jsx` | Denetim Kaydı | Değiştirilemez işlem kaydı, hash zinciri bütünlük doğrulama, arama/filtre |
| `Settings.jsx` | Ayarlar | MASAK kimlik eşiği, satış personeli indirim sınırı, fiyat yuvarlama adımı, hurda fire varsayılanı, fiş alt notu, zorunlu 2FA rolleri, satış iptal yetkisi, yedek indirme |
| `Profile.jsx` | Profil | Parola değiştirme, 2FA kurulumu (QR kod), aktif oturumlar, günlük mesai giriş-çıkış |
| `Login.jsx` | Giriş | Kullanıcı adı/parola, TOTP 2FA doğrulama adımı |

---

## 5. Canlı fiyat motoru

`server/src/services/prices.js` sunucu tarafında çalışır ve şunları yapar:

1. **Kaynaktan çekme:** Dış bir fiyat servisinden (URL `PRICE_URL` ile ayarlanır) periyodik olarak veri çeker. Hem Türkçe ("Alış"/"Satış") hem İngilizce ("Buying"/"Selling") formatları otomatik tanır.
2. **14 kalem** takip eder: HAS, GRAM, 22/18/14 ayar bilezik, çeyrek, yarım, tam, Cumhuriyet, Ata, Reşat, gremse altın, gümüş, USD/EUR/GBP/CHF.
3. **Makas uygulama:** Her kalem için dükkân sahibinin belirlediği kâr marjı (% veya sabit TL) kaynak fiyata eklenir — hem alışta hem satışta ayrı ayrı.
4. **Kaynak çökerse:** Son bilinen fiyat korunur, panelde "bayat" uyarısı gösterilir; sistem asla sıfır veya hatalı fiyatla satış yapmaz.
5. **Elle sabitleme:** İstenirse bir kalem kaynaktan bağımsız, elle girilen sabit fiyatla satılabilir (örn. kampanya günü).
6. **Yayın:** Her güncelleme Server-Sent Events (SSE) ile hem web sitesine hem panele anlık iletilir — sayfa yenileme gerekmez.
7. **Geçmiş:** Fiyatlar her 10 dakikada bir kaydedilir, 400 gün sonra otomatik budanır. Panelde 1/7/30/90 günlük grafik olarak gösterilir.
8. **Demo modu:** `PRICE_DEMO_SIMULATION=true` ile gerçek kaynağa bağlanmadan ±%0,2 (altın) / ±%0,08 (döviz) rastgele dalgalanma simüle edilir — tanıtım ve test için.

---

## 6. Kuyumculuk hesap kuralları (formüller)

Sistemin kalbi, kuyumcunun kendi dilini konuşan hesap mantığıdır (`server/src/lib/gold.js`):

| Kavram | Formül |
|---|---|
| **Has karşılığı** | gram × milyem |
| **Milyem tablosu** | 24 ayar → 0,995 · 22 ayar → 0,916 · 21 ayar → 0,875 · 18 ayar → 0,750 · 14 ayar → 0,585 · 8 ayar → 0,333 |
| **Takı satış fiyatı** | gram × has-satış × (milyem + işçilik-milyemi) + sabit işçilik (TL) + taş bedeli, sonuç ayarlardaki adıma (örn. 5 ₺) **yukarı** yuvarlanır |
| **Sarrafiye satışı** | (çeyrek/yarım/tam/Cumhuriyet/Ata/Reşat) doğrudan fiyat tablosundaki **adet** fiyatıyla satılır, gram hesabı yapılmaz |
| **Hurda/bozdurma alışı** | gram × (1 − fire%) × milyem × has-alış |
| **Eski altın takası** | Müşterinin getirdiği altın has-alış fiyatından değerlenir, satış tutarından düşülür, kasaya "has" (gram) olarak girer |
| **Veresiye** | TL **veya** gram-has cinsinden yazılabilir ("müşterinin 5 gram borcu var" gibi) |
| **Kâr hesabı** | Satış tutarı − maliyet (maliyet-has × güncel has-fiyatı + varsa TL maliyet); hem TL hem has cinsinden raporlanır |
| **Fiyat yuvarlama** | Panel ayarlarındaki adıma göre (varsayılan 5 ₺) her zaman yukarı yuvarlanır — kuyumcu kuruş üzerinden satış yapmaz |

Bu hesapların **tamamı sunucu tarafında** yapılır; tarayıcı sadece önizleme gösterir, gerçek işlem sunucunun hesapladığı tutarla kaydedilir.

---

## 7. Roller ve yetkilendirme

5 rol × 16 modül üzerinde okuma/yazma matrisi (`server/src/security/permissions.js`):

| Rol | Yetki alanı |
|---|---|
| **Patron** | Tüm modüllere tam erişim, TC kimlik görüntüleme, kullanıcı yönetimi, denetim kaydı |
| **Müdür** | Patronla aynı, yalnızca kullanıcı/denetim/ayarlarda **görüntüleme** (değiştirme yok) |
| **Satış personeli** | Satış, alış, müşteri, tamir modülleri. **Kasa ve raporları göremez.** İndirimde üst sınır uygulanır, satışı iptal edemez |
| **Muhasebe** | Kasa, tedarikçi, personel, raporlar |
| **Atölye ustası** | Yalnızca tamir ve sipariş modülü |

Her API isteğinde sunucu tarafında `can(role, module, level)` kontrolü yapılır — istemci tarafındaki menü gizleme yalnızca kullanıcı deneyimi içindir, gerçek güvenlik sınırı sunucudadır.

---

## 8. Güvenlik mimarisi

Değerli maden ticaretinde güvenlik önceliklidir; sistem katman katman korunur:

1. **Parola:** scrypt (maliyet 15) ile özetlenir; en az 10 karakter + harf + rakam zorunlu; 5 hatalı denemede 15 dakika hesap kilidi; kullanıcı adının var olup olmadığı hata mesajından anlaşılmaz.
2. **İki adımlı doğrulama (2FA):** RFC 6238 TOTP — Google/Microsoft Authenticator uyumlu; 30 saniyelik pencere; aynı kod tekrar kullanılamaz (replay koruması); rol bazında zorunlu tutulabilir.
3. **Oturum:** `httpOnly` + `SameSite=Strict` + `Secure` çerez; veritabanında yalnızca belirtecin özeti (hash) saklanır; 30 dakika hareketsizlikte, en geç 12 saatte oturum sona erer; parola değişince diğer tüm cihazlardan çıkış yapılır.
4. **CSRF ve başlıklar:** Her yazma isteğinde CSRF token + Origin kontrolü; sıkı Content-Security-Policy; HSTS; clickjacking koruması (X-Frame-Options).
5. **Veri şifreleme:** TC kimlik no, IBAN ve 2FA gizli anahtarları **AES-256-GCM** ile şifreli saklanır. TC numarasıyla arama, veriyi çözmeden **HMAC kör indeks** üzerinden yapılır. TC'yi açık görmek yalnızca patron/müdür yetkisiyle mümkündür ve her görüntüleme denetim kaydına düşer.
6. **Değiştirilemez denetim kaydı (audit log):** Her giriş, satış, iptal, fiyat değişikliği, ayar değişikliği ve yedekleme — kim, ne zaman, hangi IP'den bilgisiyle kaydedilir. Her kayıt bir önceki kaydın SHA-256 özetini içerir (**hash zinciri**); veritabanı tetikleyicileri (trigger) UPDATE/DELETE işlemlerini engeller. Panelden "zincir bütünlüğünü doğrula" ile tüm geçmiş tek tıkla kontrol edilebilir — araya bir kayıt sıkıştırılsa veya değiştirilse zincir kırılır ve tespit edilir.
7. **İş kuralı güvenliği:** Fiyatlar daima sunucuda hesaplanır; tarayıcıdan gönderilen fiyata asla güvenilmez. Satış personelinin indirim üst sınırı vardır. Satış iptali yalnızca yetkili rollere açıktır ve iz bırakır (kayıt silinmez, "iptal edildi" olarak işaretlenir). MASAK eşiği (varsayılan 185.000 ₺) üzerindeki işlemlerde kimlik bilgisi zorunlu kılınır.
8. **Dosya yükleme:** Yalnızca gerçek JPG/PNG/WEBP kabul edilir — dosya **uzantısına değil imzasına (magic bytes)** bakılır; en fazla 5 MB; rastgele dosya adı; `nosniff` başlığı; SVG/HTML gibi çalıştırılabilir içerik reddedilir.
9. **KVKK uyumu:** Açık rıza ve ticari ileti izni kaydı, aydınlatma metni, unutulma hakkı (müşteri kişisel verileri anonimleştirilir, mali kayıtlar yasal saklama süresi için korunur).
10. **Web formu koruması:** Bot tuzağı (honeypot alanı), saatlik IP başına hız sınırı, zorunlu KVKK onay kutusu.
11. **Altyapı:** Docker'da root olmayan kullanıcı, salt okunur dosya sistemi (`read_only: true`), `no-new-privileges`, sağlık kontrolü (healthcheck).

> Not: Bu yazılım mali müşavirlik veya hukuki danışmanlığın yerine geçmez. MASAK eşik tutarı, e-Fatura/e-Arşiv yükümlülükleri ve KVKK metni işletmeye özel olarak bir uzmanla gözden geçirilmelidir.

---

## 9. Veri modeli özeti

`server/src/db/schema.sql` içinde tanımlı başlıca tablolar:

- **users / sessions** — kullanıcılar, oturumlar, 2FA gizli anahtarları
- **products** — ürünler (ayar, gram, işçilik, taş, maliyet, görsel, stok)
- **sales / sale_items / sale_payments** — satışlar, satış kalemleri, çoklu ödeme satırları
- **purchase_items** — hurda/sarrafiye/toptan alışlar
- **customers / customer_ledger** — müşteri kartı ve cari hareketleri (TL + has)
- **suppliers / supplier_ledger** — tedarikçi kartı ve cari hareketleri
- **repairs** — tamir/sipariş iş emirleri ve durum geçmişi
- **staff / staff_transactions / time_logs** — personel, bordro hareketleri, mesai kayıtları
- **prices / price_history** — anlık fiyat tablosu ve geçmişi
- **cash_movements / day_closings** — kasa hareketleri ve gün sonu kapanışları
- **audit_log** — `prev_hash`/`hash` alanlarıyla zincirlenmiş, `NOT NULL` kısıtlı, `DELETE`/`UPDATE` engelleyen tetikleyicili değiştirilemez kayıt
- **site_settings / business_settings** — web sitesi ve işletme ayarları

---

## 10. PWA — telefona kurulum

Panel, App Store/Play Store onayı gerektirmeyen bir **Progressive Web App**'tir:

- **iPhone (Safari):** Siteyi aç → *Paylaş* → **Ana Ekrana Ekle**
- **Android (Chrome):** Siteyi aç → menü (⋮) → **Uygulamayı yükle**

Kurulduktan sonra tam ekran açılır; alt menüde Özet, Fiyat, **+ Satış**, Stok, Menü kısayolları bulunur. Ana ekran simgesine basılı tutulunca "Hızlı Satış" ve "Fiyatlar" kısayolları çıkar. Açık/koyu tema desteklenir.

**Güvenlik gereği** müşteri, kasa ve fiyat verileri telefonun önbelleğine **yazılmaz**; uygulama kabuğu (arayüz) çevrimdışı açılabilir ama tüm veri her zaman canlı sunucudan gelir.

---

## 11. Kurulum ve dağıtım

### Hızlı tanıtım (demo)

```bash
npm install
npm run demo
```

- Web sitesi: `http://localhost:3000`
- Panel: `http://localhost:3000/panel`
- Demo kullanıcılar (parola `DcKuyumcu2026`): `patron`, `mudur`, `satis`, `muhasebe`, `atolye`

### Gerçek kurulum (üretim)

1. Herhangi bir Linux VPS (1 GB RAM yeterli), Docker önerilir.
2. `.env.example` → `.env`; `DATA_ENCRYPTION_KEY` ve `INDEX_HMAC_KEY` rastgele üretilip yazılır ve **ayrı, güvenli bir yerde yedeklenir** (kaybolursa şifreli TC/2FA verileri bir daha açılamaz).
3. `docker compose up -d --build` — ilk patron parolası loglarda ve `data/ILK_GIRIS.txt` içinde görünür.
4. **HTTPS zorunlu:** Caddy veya nginx ile ters vekil arkasına konur (örnek Caddy yapılandırması README'de mevcuttur).
5. İlk girişte parola değişimi zorunlu tutulur; ardından Patron/Müdür için 2FA açılması önerilir.
6. Yedekleme: *Ayarlar → Yedeği indir* veya `data/` klasörünün düzenli kopyalanması.

Docker'sız kurulum: `npm ci && npm run build && NODE_ENV=production npm start` (systemd/pm2 ile arka planda çalıştırılır).

---

## 12. Test ve kalite güvencesi

- `server/test/` altında Node'un yerleşik `node:test` çatısıyla yazılmış **30 test** — kimlik doğrulama, 2FA, oturum, yetkilendirme, şifreleme, TC no maskeleme, denetim zinciri bütünlüğü, dosya yükleme güvenliği, güvenlik başlıkları, parola değişim akışı gibi kritik güvenlik ve iş kuralı senaryolarını kapsar.
- `npm test` ile çalıştırılır; tamamı yeşil (30/30 geçiyor).
- `client` derlemesi Vite ile üretim modunda test edilir (`npm run build`); tüm admin ve site sayfaları ayrı kod-bölümlerine (code-split) ayrılarak paketlenir.
- `.github/workflows/ci.yml` her push'ta bağımlılık kurulumu, test, derleme ve `npm audit` adımlarını otomatik çalıştırır.

---

## 13. Proje dosya yapısı

```
server/                 Node.js + Express API
  src/config.js         Ortam ayarları ve anahtar yönetimi
  src/db/                Şema (schema.sql), başlangıç verisi (base.js), demo verisi (seed.js)
  src/lib/gold.js        Kuyumculuk hesap fonksiyonları (milyem, has, hurda değeri)
  src/security/          Parola, TOTP, şifreleme, oturum, yetki, denetim kaydı, hız sınırı
  src/services/          Canlı fiyat servisi (prices.js), kasa/cari yardımcıları (ledger.js)
  src/routes/            13 API modülü (auth, public, prices, products, sales, purchases,
                          customers, suppliers, repairs, cash, staff, reports, admin)
  test/                  30 güvenlik ve iş kuralı testi (node:test)
client/                  React + Vite arayüzü
  src/site/               Web sitesi sayfaları (12 dosya)
  src/admin/pages/        Yönetim paneli ekranları (21 dosya)
  src/hooks/, src/lib/    Ortak kancalar (useApi, usePrices) ve yardımcılar (api, format)
  src/styles/             Tasarım sistemi (base, admin, site CSS)
  public/                 PWA manifest, service worker, ikonlar, ürün görselleri
Dockerfile, docker-compose.yml, .github/workflows/ci.yml
docs/SUNUM.md            Bu doküman
README.md                Hızlı başlangıç ve özet dokümantasyon
```

---

## 14. Kuyumcuya satış konuşması

**"Dükkânınız cebinizde, altınınız güvende."**

- **Tek sistem, iki yüz:** Müşteriniz sitenizde canlı fiyatları ve ürünlerinizi görür, WhatsApp'tan size yazar. Siz aynı sistemden satışınızı, kasanızı ve stoğunuzu yönetirsiniz.
- **Kuyumcunun dilini konuşur:** Has, milyem, işçilik, fire, çeyrek, gram veresiye, eski altın takası, toptancıyla has cari — Excel ya da deftere gerek kalmaz.
- **Akşam kasa tutar:** Gün sonu sayımında sistem kasada ne olması gerektiğini söyler, siz saydığınızı girersiniz, fark anında görünür.
- **Çalışanınızı denetler, ona güvenmek zorunda bırakmaz:** Her işlem imzalıdır ve silinemez. Satış personeli kasayı göremez, sınırın üstünde indirim yapamaz, satışı iptal edemez.
- **Telefona kurulur:** Dükkânda değilken de satışları, kasayı ve fiyatları görürsünüz.
- **Müşteri kazandırır:** Doğum günü ve yıldönümü hatırlatması, "işiniz hazır" mesajı, web sitesinden gelen talepler otomatik panelde toplanır.
- **5 dakikada kurulur, ilk gün kullanılır:** `npm run demo` ile tanıtım, tek Docker komutuyla gerçek kurulum.
