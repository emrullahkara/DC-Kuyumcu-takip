import { q, nowIso } from '../db/index.js';
import { sha256 } from './crypto.js';

const GENESIS = '0'.repeat(64);

function rowHash(prev, r) {
  return sha256([prev, r.ts, r.user_id ?? '', r.username ?? '', r.action, r.entity ?? '', r.entity_id ?? '', r.detail ?? '', r.ip ?? ''].join('|'));
}

/**
 * Hash zincirli denetim kaydı. Her kayıt bir öncekinin özetini içerir;
 * veritabanında sonradan yapılan herhangi bir oynama doğrulamada ortaya çıkar.
 */
export function audit(req, action, entity = null, entityId = null, detail = null) {
  const last = q.get('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
  const r = {
    ts: nowIso(),
    user_id: req?.user?.id ?? null,
    username: req?.user?.username ?? detail?.username ?? null,
    action,
    entity,
    entity_id: entityId === null || entityId === undefined ? null : String(entityId),
    detail: detail ? JSON.stringify(detail) : null,
    ip: req?.ip ?? null,
  };
  const prev = last?.hash || GENESIS;
  const hash = rowHash(prev, r);
  q.run(
    'INSERT INTO audit_log(ts, user_id, username, action, entity, entity_id, detail, ip, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
    r.ts, r.user_id, r.username, r.action, r.entity, r.entity_id, r.detail, r.ip, prev, hash,
  );
}

export function verifyAuditChain() {
  let prev = GENESIS;
  let count = 0;
  for (const r of q.all('SELECT * FROM audit_log ORDER BY id')) {
    if (r.prev_hash !== prev || rowHash(prev, r) !== r.hash) {
      return { ok: false, brokenAt: r.id, checked: count };
    }
    prev = r.hash;
    count++;
  }
  return { ok: true, checked: count };
}
