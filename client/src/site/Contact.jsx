import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import PageHero from './PageHero.jsx';
import { useSite } from './useSite.js';
import { telLink, waLink } from '../lib/format.js';
import { WhatsAppIcon, InstagramIcon } from './icons.jsx';
import InquiryForm from './InquiryForm.jsx';

export default function Contact() {
  const site = useSite();
  return (
    <>
      <PageHero title="İletişim" />
      <section className="section" style={{ paddingTop: 32 }}>
        <div className="wrap split" style={{ alignItems: 'start' }}>
          <div className="stack">
            <div className="contact-card">
              {site?.address && <div className="contact-line"><span className="ic"><MapPin size={18} /></span><div><b>Adres</b><div>{site.address}</div></div></div>}
              {site?.phone && <div className="contact-line"><span className="ic"><Phone size={18} /></span><div><b>Telefon</b><div><a href={telLink(site.phone)}>{site.phone}</a></div></div></div>}
              {site?.whatsapp && <div className="contact-line"><span className="ic"><WhatsAppIcon size={18} /></span><div><b>WhatsApp</b><div><a href={waLink(site.whatsapp)} target="_blank" rel="noreferrer noopener">Mesaj gönderin</a></div></div></div>}
              {site?.email && <div className="contact-line"><span className="ic"><Mail size={18} /></span><div><b>E-posta</b><div><a href={`mailto:${site.email}`}>{site.email}</a></div></div></div>}
              {site?.instagram && <div className="contact-line"><span className="ic"><InstagramIcon /></span><div><b>Instagram</b><div><a href={`https://instagram.com/${site.instagram}`} target="_blank" rel="noreferrer noopener">@{site.instagram}</a></div></div></div>}
              {(site?.hours || []).length > 0 && <div className="contact-line"><span className="ic"><Clock size={18} /></span><div><b>Çalışma saatleri</b>{site.hours.map((h) => <div key={h.day}>{h.day}: {h.time}</div>)}</div></div>}
            </div>
            {site?.map_query && <iframe className="map" title="Mağaza konumu" loading="lazy" referrerPolicy="no-referrer" src={`https://www.google.com/maps?q=${encodeURIComponent(site.map_query)}&output=embed`} />}
          </div>
          <div className="card card-pad">
            <h2 style={{ fontSize: 30 }}>Bize yazın, sizi arayalım</h2>
            <p className="muted">Ürün, fiyat, tamir veya özel sipariş için bilgi bırakın; mesai saatleri içinde dönüş yapıyoruz.</p>
            <InquiryForm />
          </div>
        </div>
      </section>
    </>
  );
}
