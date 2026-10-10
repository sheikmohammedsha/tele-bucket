import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'telebucket.db');

let db: DatabaseSync | null = null;

function connect(): DatabaseSync {
  if (db) return db;

  // node:sqlite is synchronous and creates the file on first write; the
  // directory is created lazily inside ensureDataDir before first use.
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      phone       TEXT,
      first_name  TEXT,
      last_name   TEXT,
      username    TEXT,
      session     TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS web_sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_logins (
      token           TEXT PRIMARY KEY,
      phone           TEXT NOT NULL,
      phone_code_hash TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL,
      expires_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drives (
      id          TEXT PRIMARY KEY,
      access_hash TEXT NOT NULL,
      title       TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      size        INTEGER NOT NULL DEFAULT 0,
      mime_type   TEXT,
      uploaded_at TEXT NOT NULL,
      parent_id   TEXT,
      message_id  INTEGER,
      drive_id    TEXT NOT NULL DEFAULT '',
      user_id     TEXT NOT NULL DEFAULT '',
      chunk_count INTEGER NOT NULL DEFAULT 0,
      sha256      TEXT,
      manifest_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id         TEXT PRIMARY KEY,
      item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      seq        INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      size       INTEGER NOT NULL DEFAULT 0,
      drive_id   TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_items_parent ON items (parent_id);
    CREATE INDEX IF NOT EXISTS idx_items_name   ON items (name);
    CREATE INDEX IF NOT EXISTS idx_items_drive  ON items (drive_id);
    CREATE INDEX IF NOT EXISTS idx_items_user   ON items (user_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_item  ON chunks (item_id);
  `);

  migrate(db);

  return db;
}

function migrate(database: DatabaseSync): void {
  // Older databases (pre multi-drive) had no drive_id column.
  const columns = database
    .prepare("SELECT name FROM pragma_table_info('items') WHERE name = 'drive_id'")
    .all() as { name: string }[];
  if (columns.length === 0) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        database.exec("ALTER TABLE items ADD COLUMN drive_id TEXT NOT NULL DEFAULT ''");
        return;
      } catch (error) {
        if (attempt === 4) throw error;
        // WAL contention from another process at startup; retry after a pause.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
      }
    }
  }

  // Pre-multi-user databases have no user_id column (index rows belong to the
  // first account that signs in, i.e. the owner).
  const userColumn = database
    .prepare("SELECT name FROM pragma_table_info('items') WHERE name = 'user_id'")
    .all() as { name: string }[];
  if (userColumn.length === 0) {
    database.exec("ALTER TABLE items ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
  }

  const chunkCount = database
    .prepare("SELECT name FROM pragma_table_info('items') WHERE name = 'chunk_count'")
    .all() as { name: string }[];
  if (chunkCount.length === 0) {
    database.exec(
      "ALTER TABLE items ADD COLUMN chunk_count INTEGER NOT NULL DEFAULT 0; " +
        "ALTER TABLE items ADD COLUMN sha256 TEXT; " +
        "ALTER TABLE items ADD COLUMN manifest_id INTEGER;"
    );
  }
}

let dirReady = false;

export async function getDb(): Promise<DatabaseSync> {
  if (!dirReady) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    dirReady = true;
  }
  return connect();
}

export async function getSetting(key: string): Promise<string | undefined> {
  const database = await getDb();
  const row = database
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  database
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value);
}

export async function deleteSetting(key: string): Promise<void> {
  const database = await getDb();
  database.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export interface UserRow {
  id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  session: string | null;
  created_at: string;
}

export async function getUserById(id: string): Promise<UserRow | undefined> {
  const database = await getDb();
  return database.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
}

export async function getUserByPhone(phone: string): Promise<UserRow | undefined> {
  const database = await getDb();
  return database.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as
    | UserRow
    | undefined;
}

export async function upsertUser(user: {
  id: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  session?: string;
}): Promise<UserRow> {
  const database = await getDb();
  const existing = database.prepare('SELECT created_at FROM users WHERE id = ?').get(user.id) as
    | { created_at: string }
    | undefined;
  const created = existing?.created_at ?? new Date().toISOString();
  database
    .prepare(
      `INSERT INTO users (id, phone, first_name, last_name, username, session, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         phone = COALESCE(excluded.phone, users.phone),
         first_name = COALESCE(excluded.first_name, users.first_name),
         last_name = COALESCE(excluded.last_name, users.last_name),
         username = COALESCE(excluded.username, users.username),
         session = COALESCE(excluded.session, users.session)`
    )
    .run(
      user.id,
      user.phone ?? null,
      user.firstName ?? null,
      user.lastName ?? null,
      user.username ?? null,
      user.session ?? null,
      created
    );
  return (await getUserById(user.id)) as UserRow;
}

export async function createWebSession(token: string, userId: string): Promise<void> {
  const database = await getDb();
  database
    .prepare('INSERT INTO web_sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date().toISOString());
}

export async function getWebSession(token: string): Promise<
  { token: string; user_id: string; created_at: string } | undefined
> {
  const database = await getDb();
  return database.prepare('SELECT * FROM web_sessions WHERE token = ?').get(token) as
    | { token: string; user_id: string; created_at: string }
    | undefined;
}

export async function deleteWebSession(token: string): Promise<void> {
  const database = await getDb();
  database.prepare('DELETE FROM web_sessions WHERE token = ?').run(token);
}

export async function createPendingLogin(
  token: string,
  phone: string,
  phoneCodeHash: string,
  ttlMs: number
): Promise<void> {
  const database = await getDb();
  const now = Date.now();
  database
    .prepare(
      `INSERT INTO pending_logins (token, phone, phone_code_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      token,
      phone,
      phoneCodeHash,
      new Date(now).toISOString(),
      new Date(now + ttlMs).toISOString()
    );
}

export async function getPendingLogin(token: string): Promise<
  | { token: string; phone: string; phone_code_hash: string; created_at: string; expires_at: string }
  | undefined
> {
  const database = await getDb();
  const row = database
    .prepare('SELECT * FROM pending_logins WHERE token = ?')
    .get(token) as
    | { token: string; phone: string; phone_code_hash: string; created_at: string; expires_at: string }
    | undefined;
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    database.prepare('DELETE FROM pending_logins WHERE token = ?').run(token);
    return undefined;
  }
  return row;
}

export async function deletePendingLogin(token: string): Promise<void> {
  const database = await getDb();
  database.prepare('DELETE FROM pending_logins WHERE token = ?').run(token);
}

export async function getSettingOrNull(key: string): Promise<string | null> {
  const database = await getDb();
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}