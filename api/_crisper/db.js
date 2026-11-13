// Postgres access for the Crisper Tracker.
//
// Production: Neon (Vercel Storage → Neon) over HTTP via @neondatabase/serverless,
// using DATABASE_URL (or POSTGRES_URL) that the Vercel integration injects.
// Tests/local dev: dev/server.mjs swaps in an in-process PGlite database with
// setQueryFn(), so nothing here needs a real server to run the test suite.

let queryFn = null;
let migrated = null;

export function setQueryFn(fn) {
  queryFn = fn;
  migrated = null;
}

async function getQueryFn() {
  if (queryFn) return queryFn;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.CRISPER_DATABASE_URL;
  if (!url) {
    const err = new Error('Crisper database is not configured (set DATABASE_URL).');
    err.status = 503;
    throw err;
  }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  queryFn = (text, params) => sql.query(text, params);
  return queryFn;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS crisper_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    first_name text,
    key_hash text NOT NULL UNIQUE,
    inbox_slug text NOT NULL UNIQUE,
    tz text NOT NULL DEFAULT 'America/Denver',
    has_krisp boolean NOT NULL DEFAULT false,
    krisp_changed_on date,
    reminder_pref text NOT NULL DEFAULT 'smart',
    marketing_consent boolean NOT NULL DEFAULT false,
    gmail_verification jsonb,
    source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz,
    last_reminder_at timestamptz,
    last_reminder_items text,
    first_email_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS crisper_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES crisper_users(id) ON DELETE CASCADE,
    received_at timestamptz NOT NULL DEFAULT now(),
    channel text NOT NULL,
    retailer text,
    kind text,
    order_ref text,
    subject text,
    status text NOT NULL DEFAULT 'applied',
    item_count int NOT NULL DEFAULT 0,
    matched jsonb,
    skipped jsonb,
    unknown jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS crisper_receipts_user ON crisper_receipts(user_id, received_at DESC)`,
  `CREATE TABLE IF NOT EXISTS crisper_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES crisper_users(id) ON DELETE CASCADE,
    receipt_id uuid REFERENCES crisper_receipts(id) ON DELETE SET NULL,
    produce text NOT NULL,
    qty int NOT NULL DEFAULT 1,
    weight text,
    source text NOT NULL,
    start_date date NOT NULL,
    ripening_days int NOT NULL DEFAULT 0,
    state text NOT NULL DEFAULT 'active',
    state_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE crisper_items ADD COLUMN IF NOT EXISTS rescued boolean NOT NULL DEFAULT false`,
  `ALTER TABLE crisper_items ADD COLUMN IF NOT EXISTS tossed_frac real NOT NULL DEFAULT 0`,
  `ALTER TABLE crisper_items ADD COLUMN IF NOT EXISTS trim text`,
  `ALTER TABLE crisper_users ADD COLUMN IF NOT EXISTS shop_status jsonb`,
  `ALTER TABLE crisper_users ADD COLUMN IF NOT EXISTS shop_checked_at timestamptz`,
  `ALTER TABLE crisper_users ADD COLUMN IF NOT EXISTS last_check_at timestamptz`,
  `ALTER TABLE crisper_users ADD COLUMN IF NOT EXISTS shop_day text NOT NULL DEFAULT 'Fri'`,
  `ALTER TABLE crisper_users ADD COLUMN IF NOT EXISTS last_shop_email_at timestamptz`,
  `CREATE INDEX IF NOT EXISTS crisper_items_user ON crisper_items(user_id, state)`,
  `CREATE TABLE IF NOT EXISTS crisper_events (
    id bigserial PRIMARY KEY,
    user_id uuid REFERENCES crisper_users(id) ON DELETE CASCADE,
    type text NOT NULL,
    meta jsonb,
    at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS crisper_events_type ON crisper_events(type, at)`,
  // iPhone app push tokens (APNs). One row per device; removed with the account.
  `CREATE TABLE IF NOT EXISTS crisper_devices (
    token text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES crisper_users(id) ON DELETE CASCADE,
    platform text NOT NULL DEFAULT 'ios',
    env text NOT NULL DEFAULT 'production',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS crisper_devices_user ON crisper_devices(user_id)`,
];

async function migrate(fn) {
  for (const stmt of SCHEMA) await fn(stmt, []);
}

// Every query goes through here. The schema is created on first use per cold
// start; the statements are all IF NOT EXISTS, so this is safe and cheap.
export async function q(text, params = []) {
  const fn = await getQueryFn();
  if (!migrated) migrated = migrate(fn).catch((e) => { migrated = null; throw e; });
  await migrated;
  const res = await fn(text, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

export async function logEvent(userId, type, meta = null) {
  try {
    await q('INSERT INTO crisper_events (user_id, type, meta) VALUES ($1, $2, $3::jsonb)', [userId, type, meta ? JSON.stringify(meta) : null]);
  } catch (e) {
    console.error('logEvent failed', type, e.message);
  }
}
