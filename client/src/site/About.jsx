import { ShieldCheck, Scale, Hammer, BadgePercent } from 'lucide-react';
import PageHero from './PageHero.jsx';
import { useSite, images } from './useSite.js';

const ICONS = [ShieldCheck, BadgePercent, Hammer, Scale];

export default function About() {
  const site = useSite();
  const about = images(site, 'about');
  const gallery = images(site, 'gallery');
  const years = site?.founded_year ? new Date().getFullYear() - site.founded_year : null;
  return (
    <>
      <PageHero title="Hakkımızda" />
      <section className="section">
        <div className="wrap split" style={{ alignItems: 'start' }}>
          <div>
            <div className="section-head" style={{ textAlign: 'left', margin: '0 0 12px' }}>
              <div className="eyebrow">{years ? `${years} yıllık hikâye` : 'Hikâyemiz'}</div>
              <h2>{site?.about_title}</h2>
            </div>
            <div style={{ color: 'var(--text-2)', whiteSpace: 'pre-line', fontSize: 16 }}>{site?.about_text}</div>
          </div>
          <div className="about-img">
            {about[0] ? <img src={about[0].path} alt={about[0].caption || site?.name} /> : (
              <div style={{ textAlign: 'center', color: 'var(--gold-200)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 96, lineHeight: 1 }}>{years || ''}</div>
                <div style={{ letterSpacing: '.25em', fontSize: 13, marginTop: 8 }}>YILLIK TECRÜBE</div>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="section dark">
        <div className="wrap values">
          {(site?.values || []).map((v, i) => {
            const Icon = ICONS[i % ICONS.length];
            return <div className="value" key={v.title}><Icon className="ic" size={28} /><b>{v.title}</b><p>{v.text}</p></div>;
          })}
        </div>
      </section>
      {(gallery.length > 0 || about.length > 1) && (
        <section className="section">
          <div className="wrap">
            <div className="section-head"><div className="eyebrow">Galeri</div><h2>Mağazamızdan kareler</h2></div>
            <div className="gallery">{[...about.slice(1), ...gallery].map((g) => <img key={g.id} src={g.path} alt={g.caption || ''} loading="lazy" />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
