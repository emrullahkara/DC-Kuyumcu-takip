/** Bellek içi kayan pencere hız sınırlayıcı (tek sunucu için yeterli). */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
  }, windowMs);
  timer.unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message });
    }
    arr.push(now);
    hits.set(k, arr);
    next();
  };
}
