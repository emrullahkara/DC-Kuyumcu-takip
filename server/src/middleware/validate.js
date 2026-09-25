import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const bad = (msg, extra) => new HttpError(400, msg, extra);
export const notFound = (msg = 'Kayıt bulunamadı') => new HttpError(404, msg);

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, `Geçersiz veri: ${issues.map((i) => `${i.path || 'alan'} (${i.message})`).join(', ')}`, { issues });
  }
  return r.data;
}

// Yaygın alan şemaları
export const zs = {
  id: z.coerce.number().int().positive(),
  str: (max = 200) => z.string().trim().max(max),
  optStr: (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  money: z.coerce.number().finite().min(0).max(1e10),
  num: z.coerce.number().finite(),
  gram: z.coerce.number().finite().min(0).max(100000),
  bool: z.union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 1 || v === '1' || v === 'true'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-AA-GG biçiminde olmalı'),
  phone: z.string().trim().max(20).regex(/^[0-9+ ()-]*$/, 'Geçersiz telefon'),
};

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
