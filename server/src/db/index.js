import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const stmtCache = new Map();
function stmt(sql) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

const plain = (row) => (row ? { ...row } : undefined);

/** Parametreli sorgu yardımcıları — SQL enjeksiyonuna karşı her zaman ? yer tutucuları kullanılır. */
export const q = {
  get: (sql, ...params) => plain(stmt(sql).get(...params)),
  all: (sql, ...params) => stmt(sql).all(...params).map(plain),
  run: (sql, ...params) => stmt(sql).run(...params),
};

let txDepth = 0;
/** İç içe çağrılabilen işlem (transaction) yardımcısı */
export function tx(fn) {
  if (txDepth > 0) {
    txDepth++;
    try { return fn(); } finally { txDepth--; }
  }
  db.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth--;
  }
}

export function getSetting(key, fallback = null) {
  const row = q.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  q.run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

/** S-2026-000001 biçiminde sıralı belge numarası */
export function nextNo(prefix) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  q.run('INSERT INTO counters(key, value) VALUES(?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', key);
  const { value } = q.get('SELECT value FROM counters WHERE key = ?', key);
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
}

export const nowIso = () => new Date().toISOString();

/** Yerel (İstanbul) gün sınırlarını ISO (UTC) biçimine çevirir */
export const dayStart = (d) => new Date(`${d}T00:00:00`).toISOString();
export const dayEnd = (d) => new Date(`${d}T23:59:59.999`).toISOString();
export const isoAgo = (days) => new Date(Date.now() - days * 86400_000).toISOString();
export function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
