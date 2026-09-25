import { createContext, useContext, useEffect, useState } from 'react';

export const SiteCtx = createContext(null);
export const useSite = () => useContext(SiteCtx);

let cache = null;
/** İşletme bilgilerini bir kez yükler (logo, iletişim, hakkımızda...) */
export function useSiteLoader() {
  const [site, setSite] = useState(cache);
  useEffect(() => {
    if (cache) return;
    fetch('/api/public/site').then((r) => r.json()).then((d) => { cache = d; setSite(d); }).catch(() => setSite({ name: 'Kuyumcu', images: [] }));
  }, []);
  return site;
}
export const images = (site, kind) => (site?.images || []).filter((i) => i.kind === kind);
