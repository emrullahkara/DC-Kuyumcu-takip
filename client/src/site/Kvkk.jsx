import PageHero from './PageHero.jsx';
import { useSite } from './useSite.js';

export default function Kvkk() {
  const site = useSite();
  const name = site?.name || 'İşletmemiz';
  return (
    <>
      <PageHero title="KVKK Aydınlatma Metni" />
      <section className="section" style={{ paddingTop: 32 }}>
        <div className="wrap" style={{ maxWidth: 820, color: 'var(--text-2)' }}>
          <p><b>Veri sorumlusu:</b> {name}{site?.address ? `, ${site.address}` : ''}.</p>
          <p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca; web sitemizdeki iletişim formları aracılığıyla paylaştığınız ad-soyad, telefon ve mesaj içeriğiniz, yalnızca talebinize dönüş yapılması amacıyla, KVKK m.5/2-c (sözleşmenin kurulması) ve açık rızanız hukuki sebeplerine dayanılarak işlenir.</p>
          <p>Mağazamızda yapılan alım-satım işlemlerinde, yasal yükümlülükler (Vergi Usul Kanunu, 5549 sayılı Suç Gelirlerinin Aklanmasının Önlenmesi Hakkında Kanun ve ilgili MASAK düzenlemeleri) gereği kimlik bilgileri alınabilir ve mevzuatta öngörülen süre boyunca saklanır.</p>
          <p>Kişisel verileriniz; şifreli olarak saklanır, yalnızca yetkili personelimizce erişilebilir, yasal zorunluluklar dışında üçüncü kişilerle paylaşılmaz ve yurt dışına aktarılmaz.</p>
          <p>KVKK m.11 kapsamında; verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini isteme ve itiraz etme haklarına sahipsiniz. Başvurularınızı {site?.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : 'mağazamıza'} iletebilirsiniz.</p>
          <p className="small muted">Bu metin genel bir şablondur; işletmenize özel hukuki danışmanlık ile güncellenmesi önerilir.</p>
        </div>
      </section>
    </>
  );
}
