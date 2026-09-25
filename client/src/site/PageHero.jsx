import { Link } from 'react-router-dom';
export default function PageHero({ title, crumb }) {
  return (
    <section className="page-hero">
      <div className="wrap">
        <div className="crumb"><Link to="/">Ana Sayfa</Link> / {crumb || title}</div>
        <h1>{title}</h1>
      </div>
    </section>
  );
}
