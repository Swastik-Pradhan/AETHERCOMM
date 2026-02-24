const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

let pool = null;
let sqliteDb = null;
const isPg = !!process.env.DATABASE_URL;

if (isPg) {
  console.log('[DB] Using PostgreSQL (Production Mode)');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.log('[DB] Using SQLite (Local Mode)');
  sqliteDb = new Database(path.join(__dirname, 'nerv.db'));
}

// Helper to run queries (shims $1, $2 syntax for SQLite)
const query = async (text, params = []) => {
  const start = Date.now();
  try {
    if (isPg) {
      const res = await pool.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount };
    } else {
      // SQLite shim: Convert $1, $2 -> ?, ?
      const sqliteQuery = text.replace(/\$\d+/g, '?');
      // Mock the PG result structure
      if (sqliteQuery.trim().toLowerCase().startsWith('select')) {
        const rows = sqliteDb.prepare(sqliteQuery).all(...params);
        return { rows, rowCount: rows.length };
      } else {
        const info = sqliteDb.prepare(sqliteQuery).run(...params);
        return { rows: [], rowCount: info.changes };
      }
    }
  } catch (err) {
    console.error('[DB] Query Error:', err);
    throw err;
  }
};

const initDb = async () => {
  console.log(`[DB] Initializing ${isPg ? 'PostgreSQL' : 'SQLite'} schema...`);

  const schema = isPg ? `
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#CC0000',
            avatar TEXT DEFAULT 'default',
            status TEXT DEFAULT 'Available',
            online INTEGER DEFAULT 0,
            last_seen TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS password_resets (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS friendships (
            id SERIAL PRIMARY KEY,
            sender_id TEXT NOT NULL REFERENCES users(id),
            receiver_id TEXT NOT NULL REFERENCES users(id),
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sender_id, receiver_id)
        );
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'group',
            created_by TEXT REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS room_members (
            room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (room_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS communities (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            access_code TEXT UNIQUE NOT NULL,
            avatar TEXT DEFAULT 'default',
            avatar_color TEXT DEFAULT '#CC0000',
            created_by TEXT NOT NULL REFERENCES users(id),
            max_members INTEGER DEFAULT 100,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS community_members (
            community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT DEFAULT 'member',
            status TEXT DEFAULT 'active',
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (community_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL REFERENCES users(id),
            receiver_id TEXT REFERENCES users(id),
            room_id TEXT REFERENCES rooms(id),
            community_id TEXT REFERENCES communities(id),
            reply_to_id TEXT,
            content TEXT NOT NULL,
            type TEXT DEFAULT 'text',
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            read INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS deleted_messages (
            message_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (message_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS reactions (
            id SERIAL PRIMARY KEY,
            message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            emoji TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, user_id, emoji)
        );
    ` : `
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#CC0000',
            avatar TEXT DEFAULT 'default',
            status TEXT DEFAULT 'Available',
            online INTEGER DEFAULT 0,
            last_seen TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sender_id, receiver_id)
        );
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'group',
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS room_members (
            room_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (room_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS communities (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            access_code TEXT UNIQUE NOT NULL,
            avatar TEXT DEFAULT 'default',
            avatar_color TEXT DEFAULT '#CC0000',
            created_by TEXT NOT NULL,
            max_members INTEGER DEFAULT 100,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS community_members (
            community_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT DEFAULT 'member',
            status TEXT DEFAULT 'active',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (community_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL,
            receiver_id TEXT,
            room_id TEXT,
            community_id TEXT,
            reply_to_id TEXT,
            content TEXT NOT NULL,
            type TEXT DEFAULT 'text',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            read INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS deleted_messages (
            message_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (message_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, user_id, emoji)
        );
    `;

  // Run core schema
  const statements = schema.split(';').filter(s => s.trim().length > 0);
  for (const s of statements) {
    await query(s);
  }

  // Indexes
  const indexes = `
        CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
        CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
        CREATE INDEX IF NOT EXISTS idx_messages_community ON messages(community_id);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_friendships_sender ON friendships(sender_id);
        CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id);
        CREATE INDEX IF NOT EXISTS idx_community_members ON community_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
        CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
    `;
  const indexList = indexes.split(';').filter(s => s.trim().length > 0);
  for (const idx of indexList) {
    await query(idx);
  }

  console.log('[DB] Database initialization complete');
};

module.exports = { pool, query, initDb, isPg };
