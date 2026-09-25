import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, request, login, DEMO_PASSWORD } from './helpers.js';
import { totp, verifyTotp, generateSecret, base32Decode, base32Encode } from '../src/security/totp.js';
import { encrypt, decrypt, isValidTCKN } from '../src/security/crypto.js';
import { hashPassword, verifyPassword, passwordProblems } from '../src/security/password.js';
import { q } from '../src/db/index.js';

test('yönetim API oturumsuz erişilemez', async () => {
  const r = await request(app).get('/api/admin/products');
  assert.equal(r.status, 401);
});

test('yanlış parola genel hata döner, kullanıcı varlığını sızdırmaz', async () => {
  const a = await request(app).post('/api/auth/login').send({ username: 'patron', password: 'yanlis-parola-1' });
  const b = await request(app).post('/api/auth/login').send({ username: 'olmayan', password: 'yanlis-parola-1' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error, b.body.error);
});

test('5 hatalı denemede hesap kilitlenir', async () => {
  for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'yanlis-parola-1' });
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: DEMO_PASSWORD });
  assert.equal(r.status, 423);
  q.run("UPDATE users SET locked_until = NULL, failed_count = 0 WHERE username = 'mudur'");
});

test('CSRF belirteci olmadan durum değiştiren istek reddedilir', async () => {
  const s = await login('patron');
  const r = await s.agent.post('/api/admin/customers').send({ full_name: 'Deneme Kişi' });
  assert.equal(r.status, 403);
  const ok = await s.post('/api/admin/customers', { full_name: 'Deneme Kişi', kvkk_consent: true });
  assert.equal(ok.status, 201);
});

test('yabancı origin reddedilir', async () => {
  const s = await login('patron');
  const r = await s.agent.post('/api/admin/customers').set('x-csrf-token', s.csrf).set('origin', 'https://kotu-site.example').send({ full_name: 'X Y' });
  assert.equal(r.status, 403);
});

test('rol yetkileri: satış personeli kasa ve raporları göremez', async () => {
  const s = await login('satis');
  assert.equal((await s.get('/api/admin/cash/balances')).status, 403);
  assert.equal((await s.get('/api/admin/reports/summary')).status, 403);
  assert.equal((await s.get('/api/admin/users')).status, 403);
  assert.equal((await s.get('/api/admin/products')).status, 200);
  const dash = await s.get('/api/admin/reports/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.body.cash, undefined);
});

test('atölye ustası satış yapamaz', async () => {
  const s = await login('atolye');
  const r = await s.post('/api/admin/sales', { items: [{ product_id: 25, qty: 1 }], payments: [{ method: 'nakit', amount: 1 }] });
  assert.equal(r.status, 403);
});

test('TOTP: RFC 6238 test vektörü ve 2FA ile giriş', async () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp(secret, 59_000), '287082');
  assert.equal(totp(secret, 1111111109_000), '081804');
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');

  const s = await login('muhasebe');
  const setup = await s.post('/api/auth/2fa/setup', {});
  assert.equal(setup.status, 200);
  const en = await s.post('/api/auth/2fa/enable', { code: totp(setup.body.secret) });
  assert.equal(en.status, 200);

  const step1 = await request(app).post('/api/auth/login').send({ username: 'muhasebe', password: DEMO_PASSWORD });
  assert.equal(step1.body.mfa, true);
  const bad = await request(app).post('/api/auth/login/mfa').send({ challenge: step1.body.challenge, code: '000000' });
  assert.equal(bad.status, 401);
  // Aynı kod ikinci kez kullanılamaz (enable'da kullanıldı) → bir sonraki adımın kodu
  const next = totp(setup.body.secret, Date.now() + 30_000);
  const ok = await request(app).post('/api/auth/login/mfa').send({ challenge: step1.body.challenge, code: next });
  assert.equal(ok.status, 200);
  q.run("UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_counter = NULL WHERE username = 'muhasebe'");
});

test('şifreleme, parola ve TC doğrulama', async () => {
  const c = encrypt('12345678901');
  assert.notEqual(c, '12345678901');
  assert.equal(decrypt(c), '12345678901');
  const tampered = c.slice(0, -4) + (c.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.throws(() => decrypt(tampered));
  const h = await hashPassword('Guclu-Parola-123');
  assert.equal(await verifyPassword('Guclu-Parola-123', h), true);
  assert.equal(await verifyPassword('yanlis', h), false);
  assert.ok(passwordProblems('123456').length > 0);
  assert.equal(passwordProblems('Altin2026Kuyum').length, 0);
  assert.equal(isValidTCKN('10000000146'), true);
  assert.equal(isValidTCKN('12345678901'), false);
  assert.ok(verifyTotp(generateSecret(), 'abc') === null);
});

test('müşteri TC no veritabanında şifreli, listede maskeli', async () => {
  const s = await login('patron');
  const r = await s.post('/api/admin/customers', { full_name: 'Gizli Müşteri', tckn: '10000000078', kvkk_consent: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = q.get('SELECT tckn_enc, tckn_masked FROM customers WHERE id = ?', r.body.id);
  assert.ok(!row.tckn_enc.includes('10000000078'));
  assert.equal(row.tckn_masked, '100******78');
  const found = await s.get('/api/admin/customers?q=10000000078');
  assert.equal(found.body.length, 1);
  assert.equal(found.body[0].tckn, undefined);
  const satis = await login('satis');
  assert.equal((await satis.get(`/api/admin/customers/${r.body.id}/tckn`)).status, 403);
  const reveal = await s.get(`/api/admin/customers/${r.body.id}/tckn`);
  assert.equal(reveal.body.tckn, '10000000078');
});

test('denetim kaydı zinciri doğrulanır ve değiştirilemez', async () => {
  const s = await login('patron');
  const v = await s.get('/api/admin/audit/verify');
  assert.equal(v.body.ok, true);
  assert.ok(v.body.checked > 0);
  assert.throws(() => q.run("UPDATE audit_log SET action = 'x' WHERE id = 1"), /değiştirilemez/);
  assert.throws(() => q.run('DELETE FROM audit_log WHERE id = 1'), /silinemez/);
});

test('yükleme yalnızca gerçek görsel kabul eder', async () => {
  const s = await login('patron');
  const svg = await s.agent.post('/api/admin/uploads').set('x-csrf-token', s.csrf).attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), 'a.png');
  assert.equal(svg.status, 400);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const ok = await s.agent.post('/api/admin/uploads').set('x-csrf-token', s.csrf).attach('file', png, 'x.png');
  assert.equal(ok.status, 201);
  assert.match(ok.body.path, /^\/uploads\/[\w-]+\.png$/);
});

test('güvenlik başlıkları mevcut', async () => {
  const r = await request(app).get('/api/public/site');
  assert.ok(r.headers['content-security-policy']);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-powered-by'], undefined);
});

test('parola değiştirme zorunluluğu ve oturum kapatma', async () => {
  const s = await login('patron');
  const created = await s.post('/api/admin/users', { username: 'yeni.kasiyer', full_name: 'Yeni Kasiyer', role: 'sales' });
  assert.equal(created.status, 201);
  const u = await login('yeni.kasiyer', created.body.temp_password);
  assert.equal((await u.get('/api/admin/products')).body.code, 'MUST_CHANGE_PASSWORD');
  const weak = await u.post('/api/auth/password', { current: created.body.temp_password, next: '123456' });
  assert.equal(weak.status, 400);
  const ch = await u.post('/api/auth/password', { current: created.body.temp_password, next: 'Kasiyer2026Guclu' });
  assert.equal(ch.status, 200);
  assert.equal((await u.get('/api/admin/products')).status, 200);
  await u.post('/api/auth/logout', {});
  assert.equal((await u.get('/api/admin/products')).status, 401);
});
