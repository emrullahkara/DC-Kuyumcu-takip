import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <section className="section">
      <div className="wrap center">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 96, color: 'var(--gold-500)' }}>404</div>
        <h2>Aradığınız sayfa bulunamadı</h2>
        <Link to="/" className="btn dark mt">Ana sayfaya dön</Link>
      </div>
    </section>
  );
}
