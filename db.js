const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'nerv.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Core tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#CC0000',
    avatar TEXT DEFAULT 'default',
    status TEXT DEFAULT 'Available',
    online INTEGER DEFAULT 0,
    last_seen TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id),
    UNIQUE(sender_id, receiver_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT,
    room_id TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    timestamp TEXT DEFAULT (datetime('now')),
    read INTEGER DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'group',
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
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
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS community_members (
    community_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (community_id, user_id),
    FOREIGN KEY (community_id) REFERENCES communities(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deleted_messages (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    deleted_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, user_id)
  );
`);

// Safe column migrations (must run BEFORE creating indexes on new columns)
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT 'default'"); } catch (e) { }
try { db.exec("ALTER TABLE messages ADD COLUMN community_id TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE community_members ADD COLUMN status TEXT DEFAULT 'active'"); } catch (e) { }

// Indexes (after migrations, so community_id column exists)
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
  CREATE INDEX IF NOT EXISTS idx_messages_community ON messages(community_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_friendships_sender ON friendships(sender_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_community_members ON community_members(user_id);
`);

module.exports = db;
