import { useEffect, useRef, useState } from 'react';

/** Anlık fiyatlar: önce REST ile çeker, sonra SSE akışıyla canlı günceller. */
export function usePrices() {
  const [data, setData] = useState(null);
  const [flash, setFlash] = useState({});
  const prev = useRef({});
  useEffect(() => {
    let es;
    let alive = true;
    const apply = (d) => {
      if (!alive) return;
      const f = {};
      for (const i of d.items || []) {
        const p = prev.current[i.code];
        if (p !== undefined && p !== i.sell) f[i.code] = i.sell > p ? 'up' : 'down';
        prev.current[i.code] = i.sell;
      }
      setFlash(f);
      setData(d);
    };
    fetch('/api/public/prices').then((r) => r.json()).then(apply).catch(() => {});
    if ('EventSource' in window) {
      es = new EventSource('/api/public/prices/stream');
      es.onmessage = (e) => { try { apply(JSON.parse(e.data)); } catch { /* yoksay */ } };
    }
    return () => { alive = false; es?.close(); };
  }, []);
  return { data, items: data?.items || [], flash, byCode: Object.fromEntries((data?.items || []).map((i) => [i.code, i])) };
}
