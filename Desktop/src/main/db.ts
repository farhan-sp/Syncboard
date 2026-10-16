import { v4 as uuidv4 } from 'uuid';
import { getAppPaths, DEFAULT_APP_SETTINGS } from './config';
import { DeviceModel, TransferModel, AppSettings } from '../shared/types';

const { DatabaseSync } = require('node:sqlite');
const DatabaseSyncModule = DatabaseSync;

let dbInstance: any = null;

export function initDatabase() {
  if (dbInstance) return dbInstance;
  const paths = getAppPaths();
  dbInstance = new DatabaseSyncModule(paths.dbPath);

  // WAL mode for fast writes and concurrent readers
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  // Create tables
  dbInstance.exec(`
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

  // Initialize settings
  const defaults: Record<string, any> = {
    ...DEFAULT_APP_SETTINGS,
    downloadDir: paths.downloads,
    deviceId: uuidv4(),
  };

  const getStmt = dbInstance.prepare('SELECT value FROM settings WHERE key = ?');
  const insertStmt = dbInstance.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, val] of Object.entries(defaults)) {
    const existing = getStmt.get(key);
    if (!existing) {
      insertStmt.run(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
    }
  }

  return dbInstance;
}

// --- Settings Methods ---
export function getSetting(key: string, defaultValue: string | null = null): string | null {
  const row = dbInstance.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? (row as any).value : defaultValue;
}

export function setSetting(key: string, value: any): void {
  const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
  dbInstance
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, strVal);
}

export function getAllSettings(): AppSettings {
  const paths = getAppPaths();
  return {
    serverPort: parseInt(getSetting('serverPort', '48620') || '48620', 10),
    deviceName: getSetting('deviceName', DEFAULT_APP_SETTINGS.deviceName) || DEFAULT_APP_SETTINGS.deviceName,
    downloadDir: getSetting('downloadDir', paths.downloads) || paths.downloads,
    confirmBeforeReceive: getSetting('confirmBeforeReceive', 'true') === 'true',
    historyMode: (getSetting('historyMode', 'simpan') as any) || 'simpan',
    retentionHours: parseInt(getSetting('retentionHours', '24') || '24', 10),
    theme: (getSetting('theme', 'dark') as any) || 'dark',
    startWithSystem: getSetting('startWithSystem', 'false') === 'true',
  };
}

// --- Devices Methods ---
export function getDevices(): DeviceModel[] {
  return dbInstance.prepare('SELECT * FROM devices ORDER BY lastSeenAt DESC').all() as DeviceModel[];
}

export function getDevice(id: string): DeviceModel | null {
  const row = dbInstance.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  return (row as DeviceModel) || null;
}

export function upsertDevice(dev: {
  id: string;
  name: string;
  certFingerprint: string;
  pairedAt?: number;
  lastSeenAt?: number;
  status?: string;
}): DeviceModel {
  const existing = getDevice(dev.id);
  const now = Date.now();
  if (existing) {
    dbInstance
      .prepare('UPDATE devices SET name = ?, certFingerprint = ?, lastSeenAt = ?, status = ? WHERE id = ?')
      .run(dev.name, dev.certFingerprint, dev.lastSeenAt || now, dev.status || 'paired', dev.id);
  } else {
    dbInstance
      .prepare('INSERT INTO devices (id, name, certFingerprint, pairedAt, lastSeenAt, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(dev.id, dev.name, dev.certFingerprint, dev.pairedAt || now, dev.lastSeenAt || now, dev.status || 'paired');
  }
  return getDevice(dev.id)!;
}

export function renameDevice(id: string, name: string): boolean {
  const res = dbInstance.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, id);
  return res.changes > 0;
}

export function removeDevice(id: string): boolean {
  const res = dbInstance.prepare('DELETE FROM devices WHERE id = ?').run(id);
  return res.changes > 0;
}

export function updateDeviceLastSeen(id: string): void {
  dbInstance.prepare('UPDATE devices SET lastSeenAt = ? WHERE id = ?').run(Date.now(), id);
}

// --- Transfers Methods ---
export function getTransfers(options: { limit?: number; offset?: number; kind?: string; search?: string } = {}): TransferModel[] {
  const { limit = 100, offset = 0, kind = 'all', search = '' } = options;
  let query = 'SELECT t.*, d.name as deviceName FROM transfers t LEFT JOIN devices d ON t.deviceId = d.id WHERE 1=1';
  const params: any[] = [];

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

  return dbInstance.prepare(query).all(...params) as TransferModel[];
}

export function getTransfer(id: string): TransferModel | null {
  const row = dbInstance.prepare('SELECT * FROM transfers WHERE id = ?').get(id);
  return (row as TransferModel) || null;
}

export function addTransfer(transfer: Partial<TransferModel>): TransferModel {
  const {
    id = uuidv4(),
    deviceId,
    direction = 'outgoing',
    kind = 'text',
    textBody = null,
    fileName = null,
    fileSize = null,
    savedPath = null,
    status = 'Menunggu',
    pinned = 0,
    createdAt = Date.now(),
    expiresAt = null,
  } = transfer;

  let finalExpiresAt = expiresAt;
  const historyMode = getSetting('historyMode', 'simpan');
  if (historyMode === 'kirim_sekali' && !finalExpiresAt) {
    const hours = parseInt(getSetting('retentionHours', '24') || '24', 10);
    finalExpiresAt = createdAt + hours * 3600 * 1000;
  }

  dbInstance
    .prepare(`
      INSERT INTO transfers (id, deviceId, direction, kind, textBody, fileName, fileSize, savedPath, status, pinned, createdAt, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(id, deviceId, direction, kind, textBody, fileName, fileSize, savedPath, status, pinned, createdAt, finalExpiresAt);

  return getTransfer(id)!;
}

export function updateTransfer(id: string, updates: Partial<TransferModel>): TransferModel | null {
  const keys = Object.keys(updates);
  if (keys.length === 0) return getTransfer(id);

  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => (updates as any)[k]);
  values.push(id);

  dbInstance.prepare(`UPDATE transfers SET ${setClause} WHERE id = ?`).run(...values);
  return getTransfer(id);
}

export function deleteTransfer(id: string): boolean {
  const res = dbInstance.prepare('DELETE FROM transfers WHERE id = ?').run(id);
  return res.changes > 0;
}

export function clearAllTransfers(): boolean {
  const res = dbInstance.prepare('DELETE FROM transfers').run();
  return res.changes > 0;
}

export function pinTransfer(id: string, pinned: number): TransferModel | null {
  dbInstance.prepare('UPDATE transfers SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  return getTransfer(id);
}

export function cleanupExpiredTransfers(): number {
  const historyMode = getSetting('historyMode', 'simpan');
  if (historyMode !== 'kirim_sekali') return 0;

  const now = Date.now();
  const res = dbInstance
    .prepare('DELETE FROM transfers WHERE pinned = 0 AND expiresAt IS NOT NULL AND expiresAt <= ?')
    .run(now);

  return res.changes;
}
