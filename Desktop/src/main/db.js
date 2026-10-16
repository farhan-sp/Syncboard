const { DatabaseSync } = require('node:sqlite');
const Database = DatabaseSync;

const { v4: uuidv4 } = require('uuid');
const { getPaths, getAppPaths = getPaths, DEFAULT_SETTINGS } = require('./config');

let db = null;

function initDatabase() {
  if (db) return db;
  const paths = getPaths();
  db = new Database(paths.dbPath);

  // WAL mode for fast concurrent reads and writes
  db.exec('PRAGMA journal_mode = WAL;');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      certFingerprint TEXT NOT NULL,
      pairedAt INTEGER NOT NULL,
      lastSeenAt INTEGER,
      status TEXT DEFAULT 'paired'
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      deviceId TEXT NOT NULL,
      direction TEXT NOT NULL,
      kind TEXT NOT NULL,
      textBody TEXT,
      fileName TEXT,
      fileSize INTEGER,
      savedPath TEXT,
      status TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER,
      FOREIGN KEY (deviceId) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transfers_created ON transfers(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_transfers_device ON transfers(deviceId);
    CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Initialize default settings if missing
  const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSettingStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  const defaults = { ...DEFAULT_SETTINGS, downloadDir: paths.downloads };
  if (!getSettingStmt.get('deviceId')) {
    defaults.deviceId = uuidv4();
  }

  for (const [key, val] of Object.entries(defaults)) {
    insertSettingStmt.run(key, String(val));
  }

  return db;
}

// Settings APIs
function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function getAllSettings() {
  const paths = getAppPaths();
  return {
    serverPort: parseInt(getSetting('serverPort', '48620') || '48620', 10),
    deviceName: getSetting('deviceName', DEFAULT_SETTINGS.deviceName) || DEFAULT_SETTINGS.deviceName,
    downloadDir: getSetting('downloadDir', paths.downloads) || paths.downloads,
    confirmBeforeReceive: getSetting('confirmBeforeReceive', 'true') === 'true',
    historyMode: getSetting('historyMode', 'simpan') || 'simpan',
    retentionHours: parseInt(getSetting('retentionHours', '24') || '24', 10),
    theme: getSetting('theme', 'dark') || 'dark',
    startWithSystem: getSetting('startWithSystem', 'false') === 'true',
  };
}

// Devices APIs
function getDevices() {
  return db.prepare('SELECT * FROM devices ORDER BY pairedAt DESC').all();
}

function getDevice(id) {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  return row || null;
}

function upsertDevice({ id, name, certFingerprint, pairedAt, lastSeenAt, status = 'paired' }) {
  const existing = getDevice(id);
  if (existing) {
    db.prepare(`
      UPDATE devices 
      SET name = ?, certFingerprint = ?, lastSeenAt = ?, status = ?
      WHERE id = ?
    `).run(name, certFingerprint, lastSeenAt || Date.now(), status, id);
  } else {
    db.prepare(`
      INSERT INTO devices (id, name, certFingerprint, pairedAt, lastSeenAt, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, certFingerprint, pairedAt || Date.now(), lastSeenAt || Date.now(), status);
  }
  return getDevice(id);
}

function removeDevice(id) {
  db.prepare('DELETE FROM devices WHERE id = ?').run(id);
}

function updateDeviceLastSeen(id) {
  db.prepare('UPDATE devices SET lastSeenAt = ? WHERE id = ?').run(Date.now(), id);
}

// Transfers APIs
function getTransfers({ limit = 100, offset = 0, kind = 'all', search = '' } = {}) {
  let query = 'SELECT t.*, d.name as deviceName FROM transfers t LEFT JOIN devices d ON t.deviceId = d.id WHERE 1=1';
  const params = [];

  if (kind && kind !== 'all') {
    if (kind === 'pinned') {
      query += ' AND t.pinned = 1';
    } else if (kind === 'text_or_link') {
      query += ' AND (t.kind = ? OR t.kind = ?)';
      params.push('text', 'link');
    } else {
      query += ' AND t.kind = ?';
      params.push(kind);
    }
  }

  if (search && search.trim()) {
    query += ' AND (t.textBody LIKE ? OR t.fileName LIKE ? OR d.name LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY t.pinned DESC, t.createdAt DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function getTransfer(id) {
  const row = db.prepare('SELECT * FROM transfers WHERE id = ?').get(id);
  return row || null;
}

function addTransfer(transfer) {
  const {
    id = uuidv4(),
    deviceId,
    direction,
    kind,
    textBody = null,
    fileName = null,
    fileSize = null,
    savedPath = null,
    status = 'Menunggu',
    pinned = 0,
    createdAt = Date.now(),
    expiresAt = null,
  } = transfer;

  // Calculate retention expiry if Kirim Sekali mode is active
  let finalExpiresAt = expiresAt;
  const historyMode = getSetting('historyMode', 'simpan');
  if (historyMode === 'kirim_sekali' && !finalExpiresAt) {
    const hours = parseInt(getSetting('retentionHours', '24'), 10) || 24;
    finalExpiresAt = createdAt + hours * 3600 * 1000;
  }

  db.prepare(`
    INSERT INTO transfers (id, deviceId, direction, kind, textBody, fileName, fileSize, savedPath, status, pinned, createdAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    deviceId,
    direction,
    kind,
    textBody,
    fileName,
    fileSize,
    savedPath,
    status,
    pinned,
    createdAt,
    finalExpiresAt
  );

  return getTransfer(id);
}

function updateTransfer(id, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return getTransfer(id);

  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => updates[k]);
  values.push(id);

  db.prepare(`UPDATE transfers SET ${setClause} WHERE id = ?`).run(...values);
  return getTransfer(id);
}

function deleteTransfer(id) {
  const result = db.prepare('DELETE FROM transfers WHERE id = ?').run(id);
  return result.changes > 0;
}

function clearAllTransfers() {
  const result = db.prepare('DELETE FROM transfers').run();
  return result.changes > 0;
}

function pinTransfer(id, pinned = 1) {
  db.prepare('UPDATE transfers SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  return getTransfer(id);
}

function cleanupExpiredTransfers() {
  const historyMode = getSetting('historyMode', 'simpan');
  if (historyMode !== 'kirim_sekali') return 0;

  const now = Date.now();
  // Pinned items are NEVER automatically deleted
  const result = db.prepare(`
    DELETE FROM transfers 
    WHERE pinned = 0 AND expiresAt IS NOT NULL AND expiresAt <= ?
  `).run(now);

  return result.changes;
}

module.exports = {
  initDatabase,
  getSetting,
  setSetting,
  getAllSettings,
  getDevices,
  getDevice,
  upsertDevice,
  removeDevice,
  updateDeviceLastSeen,
  getTransfers,
  getTransfer,
  addTransfer,
  updateTransfer,
  deleteTransfer,
  clearAllTransfers,
  pinTransfer,
  cleanupExpiredTransfers,
};
