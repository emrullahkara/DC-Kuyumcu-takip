process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/app.js');
const { seedDemo, DEMO_PASSWORD } = await import('../src/db/seed.js');
const request = (await import('supertest')).default;

await seedDemo();
export const app = createApp();
export { request, DEMO_PASSWORD };

/** Giriş yapıp çerez + CSRF belirteciyle istek atan ajan döner */
export async function login(username, password = DEMO_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.csrf;
  const wrap = (method) => (url, body) => {
    const r = agent[method](url).set('x-csrf-token', csrf);
    return body !== undefined ? r.send(body) : r;
  };
  return { agent, csrf, get: (url) => agent.get(url), post: wrap('post'), put: wrap('put'), del: wrap('delete') };
}
