import { config } from './config.js';
import { createApp } from './app.js';
import { startPriceLoop } from './services/prices.js';
import { purgeExpired } from './security/session.js';
import { seedOwner } from './db/seed.js';
import { q } from './db/index.js';

const app = createApp();

if (!q.get('SELECT 1 FROM users LIMIT 1')) {
  const r = await seedOwner();
  if (r) console.log(`\n[kurulum] İlk patron hesabı oluşturuldu → kullanıcı: ${r.username}  geçici parola: ${r.password}\n  (İlk girişte parolanızı değiştirmeniz istenecek. Bu çıktıyı güvenli yerde saklayın.)\n`);
}

startPriceLoop();
setInterval(purgeExpired, 10 * 60_000).unref();

app.listen(config.port, config.host, () => {
  console.log(`DC Kuyumcu Takip çalışıyor → http://localhost:${config.port}  (${config.isProd ? 'üretim' : 'geliştirme'})`);
});
