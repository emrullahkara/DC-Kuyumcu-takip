# DC Kuyumcu Takip

Kuyumcular için **web sitesi + yönetim paneli + telefon uygulaması (PWA)**, tek bir sistemde.

Müşterinin gördüğü tarafta kuyumcunun kendi logosu, anlık altın ve döviz fiyatları, ürün vitrini, hakkımızda, iletişim ve "altınım ne eder" hesaplayıcısı var. Dükkânın gördüğü tarafta ise satış, alış/bozdurma, stok, müşteri carisi (TL ve gram), tamir/sipariş, kasa, personel ve raporlar yönetiliyor. Hepsi aynı veritabanını kullanır: panelde fiyat ya da ürün değiştiğinde web sitesi de aynı anda güncellenir.

---

## İçindekiler
1. [Neler var?](#neler-var)
2. [Hızlı başlangıç (demo)](#hızlı-başlangıç-demo)
3. [Gerçek kurulum (üretim)](#gerçek-kurulum-üretim)
4. [Telefona kurulum](#telefona-kurulum)
5. [Güvenlik](#güvenlik)
6. [Kuyumculuk hesap kuralları](#kuyumculuk-hesap-kuralları)
7. [Proje yapısı](#proje-yapısı)
8. [Kuyumcuya sunum özeti](#kuyumcuya-sunum-özeti)

---

## Neler var?

### Web sitesi (müşterinin gördüğü taraf)
| Sayfa | İçerik |
|---|---|
| Ana sayfa | Logo, kayan canlı fiyat bandı, canlı fiyat tablosu (has, gram, 22 ayar, çeyrek, yarım, tam, dolar, euro), koleksiyonlar, öne çıkan ürünler, "Neden biz?", hakkımızda özeti, adres, çalışma saatleri ve harita |
| Ürünlerimiz | Kategori (yüzük, alyans, pırlanta, kolye, bileklik, bilezik, küpe, set, ziynet, gümüş), ayar filtresi, sıralama, arama |
| Ürün detayı | Ayar, gram, taş bilgisi, **anlık has fiyatına göre hesaplanan fiyat**, "WhatsApp ile sor", "Hemen ara", "Beni arayın" formu, benzer ürünler |
| Altın Fiyatları | Altın, sarrafiye, gümüş ve döviz için alış, satış ve değişim. Sayfa yenilenmeden canlı güncellenir |
| Altın Hesapla | Ayar ve gramdan ya da çeyrek/ziynet adedinden bozdurma değerini hesaplar |
| Hakkımızda / İletişim / KVKK | Firma hikâyesi, galeri, iletişim bilgileri, harita, aydınlatma metni |

Tüm sayfalarda sağ altta WhatsApp düğmesi ve altta sosyal medya bağlantıları bulunur.

### Yönetim paneli (dükkânın gördüğü taraf)
| Modül | Ne işe yarar? |
|---|---|
| **Gösterge Paneli** | Günün satışı ve alışı, kasadaki TL, döviz ve has altın, stoğun has değeri, geciken tamirler, düşük stok, bugün doğum günü veya evlilik yıldönümü olan müşteriler, mesai giriş-çıkışı |
| **Fiyat & Kur** | Kaynaktan otomatik gelen fiyat, her kalem için alış ve satış makası (% ya da TL), elle sabitleme, fiyat geçmişi grafiği, hızlı ayar hesabı |
| **Hızlı Satış (POS)** | Barkod okuyucu desteği, sepet, müşteri seçimi, indirim. **Çoklu ödeme:** nakit, kart, havale, döviz, eski altın takası ve veresiye (TL ya da **gram**). Fiş yazdırma ve fişi WhatsApp ile gönderme |
| **Alış & Bozdurma** | Hurda altın alımı (ayar, gram, fire), sarrafiye geri alımı, toptancıdan mal alımı (has cariye yazılır) |
| **Tamir & Sipariş** | İş emri; kapora; *teslim alındı → atölyede → hazır → teslim edildi* akışı; usta atama; fotoğraf; "işiniz hazır" WhatsApp mesajı; müşteriye verilen fiş |
| **Ürünler & Stok** | Ayar, milyem, gram, işçilik milyemi, taş, maliyet (has), konum, görsel. Stok giriş/çıkış/sayım, barkod etiketi basma, stoğun has değeri |
| **Müşteriler** | Cari (TL, gram has, döviz), tahsilat, emanet, alış-satış ve tamir geçmişi, şifreli TC kimlik no, KVKK anonimleştirme, doğum günü ve yıldönümü hatırlatmaları |
| **Tedarikçiler** | Toptancıyla has ve TL cari, ödeme |
| **Kasa & Gelir-Gider** | Kasa, banka ve POS bakiyeleri (TL, USD, EUR, GBP, has); gider ve gelir kaydı; döviz bozdurma; virman; **gün sonu kasa sayımı** ve fark raporu |
| **Raporlar** | Satış, brüt ve net kâr (TL ve has), kategori, personel, ödeme türü, en çok satanlar, giderler |
| **Personel** | Maaş, prim oranı, avans ve kesinti, aylık bordro özeti, mesai takibi, satış performansı |
| **Web Sitesi** | Firma bilgileri, logo, vitrin ve hakkımızda görselleri, galeri, çalışma saatleri, sitede gösterilecek fiyatlar |
| **Web Talepleri** | Siteden gelen "beni arayın" talepleri |
| **Kullanıcılar / Denetim / Ayarlar** | Rol ve yetkiler, 2FA, parola sıfırlama, değiştirilemez işlem kaydı, MASAK eşiği, indirim sınırı, yedek indirme |

---

## Hızlı başlangıç (demo)

Node.js **22.13 veya üzeri** gerekir. Ayrıca kurulması gereken bir veritabanı sunucusu yoktur; Node'un yerleşik SQLite'ı kullanılır.

```bash
npm install
npm run demo
```

Tarayıcıda açın:
- Web sitesi: <http://localhost:3000>
- Panel: <http://localhost:3000/panel>

**Demo kullanıcıları** (hepsinin parolası `DcKuyumcu2026`):

| Kullanıcı | Rol | Görebildikleri |
|---|---|---|
| `patron` | Patron | Her şey |
| `mudur` | Müdür | Kullanıcı, denetim ve ayarlarda yalnızca görüntüleme |
| `satis` | Satış personeli | Satış, alış, müşteri, tamir. Kasa ve raporları **göremez** |
| `muhasebe` | Muhasebe | Kasa, tedarikçi, personel, raporlar |
| `atolye` | Atölye ustası | Tamir ve sipariş |

> ⚠️ Demo parolaları yalnızca tanıtım içindir. Gerçek kullanımda `--demo` ile veri yüklemeyin.

Geliştirme için `npm run dev` komutunu kullanın (API :3000, arayüz :5173). Testler için `npm test` çalıştırın.

---

## Gerçek kurulum (üretim)

1. **Sunucu:** Herhangi bir Linux VPS yeterlidir (1 GB RAM). Docker önerilir.
2. **Ortam dosyası:**
   ```bash
   cp .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # DATA_ENCRYPTION_KEY için
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # INDEX_HMAC_KEY için
   ```
   Üretilen iki değeri `.env` dosyasına yazın. **Bu anahtarların yedeğini ayrı ve güvenli bir yerde saklayın.** Anahtar kaybolursa şifreli alanlar (TC no, 2FA) bir daha açılamaz.
3. **Çalıştırma:**
   ```bash
   docker compose up -d --build
   docker compose logs kuyumcu     # ilk patron parolası burada ve data/ILK_GIRIS.txt dosyasında yazar
   ```
4. **HTTPS (zorunlu):** Sistemi alan adıyla bir ters vekilin (Caddy ya da nginx) arkasına koyun. En kolayı Caddy'dir:
   ```
   kuyumcum.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```
5. **İlk giriş:** `patron` kullanıcısıyla girin. Sistem önce parolanızı değiştirmenizi ister. Ardından *Profil → İki adımlı doğrulama* adımını açın ve *Ayarlar* bölümünden Patron ile Müdür için 2FA'yı zorunlu yapın.
6. **Yedekleme:** *Ayarlar → Yedeği indir* ile haftalık yedek alın ya da `data/` klasörünü düzenli olarak başka bir yere kopyalayın.

Docker kullanmadan kurmak için: `npm ci && npm run build && NODE_ENV=production npm start` (systemd ya da pm2 ile).

---

## Telefona kurulum

Panel, telefona **uygulama gibi kurulabilen** bir PWA'dır. App Store ya da Play Store onayı gerekmez.

- **iPhone (Safari):** Siteyi açın → *Paylaş* → **Ana Ekrana Ekle**
- **Android (Chrome):** Siteyi açın → menü (⋮) → **Uygulamayı yükle**

Kurulduktan sonra tam ekran açılır. Alt menüde Özet, Fiyat, **+ Satış**, Stok ve Menü bulunur. Ana ekran simgesine basılı tutunca "Hızlı Satış" ve "Fiyatlar" kısayolları çıkar. Açık ve koyu tema desteklenir.

Güvenlik gereği müşteri, kasa ve fiyat verileri telefonun önbelleğine **yazılmaz**. Uygulama kabuğu çevrimdışı açılır, ancak veriler her zaman sunucudan canlı gelir.

---

## Güvenlik

Değerli maden ticaretinde güvenlik en öncelikli konu olduğu için sistem katmanlı olarak korunur:

| Katman | Önlem |
|---|---|
| Giriş | scrypt ile özetlenmiş parolalar; en az 10 karakterlik parola politikası; **5 hatalı denemede 15 dakika hesap kilidi**; IP başına hız sınırı; kullanıcının var olup olmadığı dışarıya sızdırılmaz |
| İki adımlı doğrulama | Google ve Microsoft Authenticator ile uyumlu TOTP; aynı kod ikinci kez kullanılamaz; rol bazında zorunlu tutulabilir |
| Oturum | `httpOnly` + `SameSite=Strict` + `Secure` çerez; veritabanında yalnızca belirtecin özeti tutulur; 30 dakika hareketsizlikte ve en geç 12 saatte oturum kapanır; parola değişince diğer cihazlardan çıkış yapılır |
| İstek güvenliği | Her yazma işleminde CSRF belirteci ve Origin kontrolü; sıkı Content-Security-Policy; HSTS; clickjacking koruması |
| Yetki | 5 rol × 16 modül yetki tablosu, sunucu tarafında her istekte denetlenir. Satış personeli kasa bakiyesini göremez |
| Veri | TC kimlik no, IBAN ve 2FA anahtarları **AES-256-GCM** ile şifreli saklanır. TC ile arama, şifre çözmeden kör indeks (HMAC) üzerinden yapılır. TC'yi açık görmek yalnızca patron veya müdür yetkisiyle mümkündür ve her görüntüleme kayda geçer |
| Denetim kaydı | Her giriş, satış, iptal, fiyat, ayar ve yedek işlemi kim, ne zaman ve hangi IP'den bilgisiyle kaydedilir. Kayıtlar **hash zinciriyle** birbirine bağlıdır; veritabanı tetikleyicileri silme ve değiştirmeyi engeller. Panelden "bütünlüğü doğrula" ile kontrol edilebilir |
| İş kuralları | Fiyatlar **daima sunucuda** hesaplanır, istemcinin gönderdiği fiyata güvenilmez. Satış personelinin indirim sınırı vardır. Satış iptali yalnızca yetkili rollere açıktır ve iz bırakır (kayıt silinmez). MASAK eşiği üzerindeki işlemlerde kimlik zorunludur |
| Dosya yükleme | Yalnızca gerçek JPG, PNG ve WEBP kabul edilir (uzantıya değil dosya imzasına bakılır); en fazla 5 MB; rastgele dosya adı; `nosniff` ve sandbox başlıkları |
| KVKK | Açık rıza ve ticari ileti izni kaydı, aydınlatma metni, unutulma hakkı (anonimleştirme, mali kayıtlar korunur) |
| Web formu | Bot tuzağı (honeypot), saatlik hız sınırı, zorunlu KVKK onayı |
| Altyapı | Docker'da root olmayan kullanıcı, salt okunur dosya sistemi, `no-new-privileges` |

> Bu yazılım mali müşavirlik veya hukuki danışmanlığın yerine geçmez. MASAK eşik tutarı, e-Fatura/e-Arşiv yükümlülükleri ve KVKK metni işletmeye göre uzmanla gözden geçirilmelidir.

---

## Kuyumculuk hesap kuralları

- **Has karşılığı** = gram × milyem. Kullanılan milyemler: 24 ayar 0,995 · 22 ayar 0,916 · 21 ayar 0,875 · 18 ayar 0,750 · 14 ayar 0,585 · 8 ayar 0,333
- **Takı satış fiyatı** = gram × has satış × (milyem + işçilik milyemi) + sabit işçilik + taş. Sonuç ayarlardaki adıma (örneğin 5 ₺) yukarı yuvarlanır.
- **Sarrafiye** (çeyrek, yarım, tam, Cumhuriyet, Ata, Reşat, gremse) doğrudan fiyat tablosundaki adet fiyatıyla satılır.
- **Hurda alış** = gram × (1 − fire %) × milyem × has alış.
- **Eski altın takası:** Müşterinin getirdiği altın has alış fiyatından değerlenir, satış tutarından düşülür ve kasaya "has" olarak girer.
- **Veresiye:** TL ya da gram has cinsinden yazılabilir ("5 gram borcu var").
- **Kâr:** Satış tutarından maliyet (maliyet has × güncel has + TL maliyet) düşülerek bulunur. Hem TL hem has cinsinden gösterilir.
- **Fiyat makası:** Kaynak fiyata alışta ve satışta ayrı ayrı yüzde ya da TL eklenir. Kaynak çökerse son fiyat korunur ve panelde uyarı çıkar. Gerektiğinde fiyat elle sabitlenebilir.

---

## Proje yapısı

```
server/                 Node.js + Express API
  src/config.js         Ortam ayarları ve anahtar yönetimi
  src/db/               Şema, başlangıç verisi, demo verisi
  src/security/         Parola, TOTP, şifreleme, oturum, yetki, denetim kaydı, hız sınırı
  src/services/         Canlı fiyat servisi, kasa ve cari yardımcıları
  src/routes/           API uç noktaları (satış, alış, ürün, müşteri, kasa, personel, rapor…)
  test/                 Güvenlik ve iş kuralı testleri (node:test)
client/                 React + Vite arayüzü
  src/site/             Web sitesi sayfaları
  src/admin/            Yönetim paneli
  public/               PWA manifest, service worker, ikonlar, ürün görselleri
Dockerfile, docker-compose.yml, .github/workflows/ci.yml
```

---

## Kuyumcuya sunum özeti

**"Dükkânınız cebinizde, altınınız güvende."**

- **Tek sistem, iki yüz:** Müşteriniz sitenizde canlı fiyatları ve ürünlerinizi görür, WhatsApp'tan size yazar. Siz aynı sistemden satışınızı, kasanızı ve stoğunuzu yönetirsiniz.
- **Kuyumcunun dilini konuşur:** Has, milyem, işçilik, fire, çeyrek, gram veresiye, eski altın takası, toptancıyla has cari. Excel ya da defter tutmaya gerek kalmaz.
- **Akşam kasa tutar:** Gün sonu sayımında sistem kasada ne olması gerektiğini söyler, siz saydığınızı girersiniz, fark anında görünür.
- **Çalışanınızı denetler, ona güvenmek zorunda bırakmaz:** Her işlem imzalıdır ve silinemez. Satış personeli kasayı göremez, sınırın üstünde indirim yapamaz, satışı iptal edemez.
- **Telefona kurulur:** Dükkânda değilken de satışları, kasayı ve fiyatları görürsünüz.
- **Müşteri kazandırır:** Doğum günü ve yıldönümü hatırlatması, "işiniz hazır" mesajı, web sitesinden gelen talepler.
