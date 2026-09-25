PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  position TEXT,
  tckn_enc TEXT,
  tckn_masked TEXT,
  iban_enc TEXT,
  start_date TEXT,
  salary REAL NOT NULL DEFAULT 0,
  commission_pct REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','sales','accountant','workshop')),
  password_hash TEXT NOT NULL,
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_counter INTEGER,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  staff_id INTEGER REFERENCES staff(id),
  last_login_at TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,               -- sha256(token); düz token asla saklanmaz
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS mfa_challenges (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,
  ip TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);

-- Denetim kaydı değiştirilemez: UPDATE/DELETE engellenir
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'Denetim kaydı değiştirilemez'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'Denetim kaydı silinemez'); END;

CREATE TABLE IF NOT EXISTS price_items (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('altin','sarrafiye','gumus','doviz')),
  unit TEXT NOT NULL DEFAULT 'gram',
  milyem REAL,
  sort INTEGER NOT NULL DEFAULT 0,
  show_on_site INTEGER NOT NULL DEFAULT 1,
  source_buy REAL,
  source_sell REAL,
  source_change REAL,
  source_updated_at TEXT,
  margin_type TEXT NOT NULL DEFAULT 'pct' CHECK (margin_type IN ('pct','fixed')),
  margin_buy REAL NOT NULL DEFAULT 0,   -- alışta düşülecek makas
  margin_sell REAL NOT NULL DEFAULT 0,  -- satışta eklenecek makas
  manual_active INTEGER NOT NULL DEFAULT 0,
  manual_buy REAL,
  manual_sell REAL,
  buy REAL,
  sell REAL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  buy REAL,
  sell REAL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_history ON price_history(code, ts);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  show_on_site INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  kind TEXT NOT NULL DEFAULT 'taki' CHECK (kind IN ('taki','sarrafiye','pirlanta','gumus','saat','diger')),
  karat TEXT,                 -- 8,14,18,21,22,24,925
  milyem REAL,                -- 0.585, 0.750, 0.916 ...
  gram REAL NOT NULL DEFAULT 0,
  labor_milyem REAL NOT NULL DEFAULT 0,   -- işçilik (milyem olarak)
  labor_tl REAL NOT NULL DEFAULT 0,       -- sabit işçilik (TL)
  stone_desc TEXT,
  stone_price REAL NOT NULL DEFAULT 0,
  price_code TEXT REFERENCES price_items(code),  -- sarrafiye için fiyat kalemi
  price_mode TEXT NOT NULL DEFAULT 'auto' CHECK (price_mode IN ('auto','fixed')),
  fixed_price REAL,
  cost_has REAL NOT NULL DEFAULT 0,       -- birim maliyet (has gram)
  cost_tl REAL NOT NULL DEFAULT 0,        -- birim ek maliyet (TL)
  supplier_id INTEGER REFERENCES suppliers(id),
  stock_qty INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  description TEXT,
  image TEXT,
  show_on_site INTEGER NOT NULL DEFAULT 1,
  show_price_on_site INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK (type IN ('giris','cikis','satis','iade','sayim','alis','iptal')),
  qty INTEGER NOT NULL,
  note TEXT,
  ref_type TEXT,
  ref_id INTEGER,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stock_mov ON stock_movements(product_id, ts);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tckn_enc TEXT,
  tckn_index TEXT,
  tckn_masked TEXT,
  birth_date TEXT,
  anniversary_date TEXT,
  address TEXT,
  notes TEXT,
  tags TEXT,
  kvkk_consent INTEGER NOT NULL DEFAULT 0,
  kvkk_consent_at TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  anonymized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_tckn ON customers(tckn_index);

-- Cari hareketler: amount > 0 => müşteri bize borçlu; < 0 => biz müşteriye borçluyuz (emanet/alacak)
CREATE TABLE IF NOT EXISTS customer_ledger (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('TRY','HAS','USD','EUR')),
  amount REAL NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  note TEXT,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cledger ON customer_ledger(customer_id);

-- Tedarikçi (toptancı) cari: amount > 0 => biz tedarikçiye borçluyuz
CREATE TABLE IF NOT EXISTS supplier_ledger (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  type TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('TRY','HAS','USD','EUR')),
  amount REAL NOT NULL,
  note TEXT,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sledger ON supplier_ledger(supplier_id);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  no TEXT NOT NULL UNIQUE,
  ts TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  staff_id INTEGER REFERENCES staff(id),
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  has_total REAL NOT NULL DEFAULT 0,
  cost_total REAL NOT NULL DEFAULT 0,
  paid_total REAL NOT NULL DEFAULT 0,
  credit_total REAL NOT NULL DEFAULT 0,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'tamam' CHECK (status IN ('tamam','iptal')),
  cancel_reason TEXT,
  cancelled_by INTEGER,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_ts ON sales(ts);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  karat TEXT,
  milyem REAL,
  gram REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL,
  total REAL NOT NULL,
  has_equivalent REAL NOT NULL DEFAULT 0,
  labor_amount REAL NOT NULL DEFAULT 0,
  cost_estimate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY,
  no TEXT NOT NULL UNIQUE,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hurda','sarrafiye','urun')),
  customer_id INTEGER REFERENCES customers(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  total REAL NOT NULL,
  has_total REAL NOT NULL DEFAULT 0,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'tamam' CHECK (status IN ('tamam','iptal')),
  sale_id INTEGER REFERENCES sales(id),
  cancel_reason TEXT
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  karat TEXT,
  milyem REAL,
  gram REAL NOT NULL DEFAULT 0,
  fire_pct REAL NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  price_code TEXT,
  unit_price REAL NOT NULL,
  has_equivalent REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL
);

-- Kasa hareketleri: her para giriş/çıkışı burada. direction: in/out
CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  account TEXT NOT NULL CHECK (account IN ('kasa','banka','pos')),
  currency TEXT NOT NULL CHECK (currency IN ('TRY','USD','EUR','GBP','HAS')),
  amount REAL NOT NULL CHECK (amount >= 0),
  rate REAL NOT NULL DEFAULT 1,          -- 1 birim = kaç TL
  amount_try REAL NOT NULL,
  category TEXT NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  description TEXT,
  user_id INTEGER,
  cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cash_ts ON cash_movements(ts);
CREATE INDEX IF NOT EXISTS idx_cash_ref ON cash_movements(ref_type, ref_id);

CREATE TABLE IF NOT EXISTS day_closings (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  expected TEXT NOT NULL,
  counted TEXT NOT NULL,
  diff TEXT NOT NULL,
  note TEXT,
  user_id INTEGER,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repairs (
  id INTEGER PRIMARY KEY,
  no TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('tamir','siparis','boy','temizlik','kaplama','diger')),
  customer_id INTEGER REFERENCES customers(id),
  item_desc TEXT NOT NULL,
  karat TEXT,
  gram_in REAL,
  issue TEXT,
  estimated_price REAL NOT NULL DEFAULT 0,
  deposit REAL NOT NULL DEFAULT 0,
  final_price REAL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'alindi' CHECK (status IN ('alindi','atolyede','hazir','teslim','iptal')),
  assigned_staff_id INTEGER REFERENCES staff(id),
  photo TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  delivered_at TEXT,
  user_id INTEGER
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  note TEXT,
  UNIQUE (staff_id, date)
);

CREATE TABLE IF NOT EXISTS staff_transactions (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  ts TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('maas','avans','prim','kesinti')),
  amount REAL NOT NULL,
  period TEXT,
  note TEXT,
  user_id INTEGER
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT,
  product_id INTEGER REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'yeni' CHECK (status IN ('yeni','arandi','kapandi')),
  ip_hash TEXT
);

CREATE TABLE IF NOT EXISTS site_images (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('logo','hero','about','gallery')),
  path TEXT NOT NULL,
  caption TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
