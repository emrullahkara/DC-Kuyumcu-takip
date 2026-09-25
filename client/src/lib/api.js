// API istemcisi: çerez tabanlı oturum + her yazma isteğinde CSRF belirteci
let csrfToken = null;
export const setCsrf = (t) => { csrfToken = t; };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Hata (${status})`);
    this.status = status;
    this.body = body;
    this.code = body?.code;
  }
}

const listeners = new Set();
/** 401 gibi oturum olaylarını dinlemek için */
export const onAuthEvent = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

async function request(method, url, body, opts = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, headers, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(url, init);
  if (opts.raw) return res;
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text }; } }
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (res.status === 401 && url.startsWith('/api/admin')) listeners.forEach((fn) => fn({ type: 'unauthorized' }));
    if (res.status === 403 && (err.code === 'MUST_CHANGE_PASSWORD' || err.code === 'MFA_SETUP_REQUIRED')) listeners.forEach((fn) => fn({ type: err.code }));
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  upload: (url, file, extra = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(extra).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, v));
    return request('POST', url, fd);
  },
  raw: (url) => request('GET', url, undefined, { raw: true }),
};

/** /api/admin kısaltması */
export const A = (path) => `/api/admin${path}`;
