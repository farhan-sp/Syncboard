/**
 * Protocol and application constants for SyncBoard
 */

export const PROTOCOL_VERSION = 1;

export const DEFAULT_PORT = 48620;

export const DEFAULT_CHUNK_SIZE = 256 * 1024; // 256 KB

export const BINARY_HEADER_ID_SIZE = 16; // 16 bytes Transfer ID (UUID raw binary)
export const BINARY_HEADER_OFFSET_SIZE = 8; // 8 bytes Offset (Big-Endian uint64)
export const BINARY_HEADER_TOTAL_SIZE = BINARY_HEADER_ID_SIZE + BINARY_HEADER_OFFSET_SIZE; // 24 bytes

export const PING_INTERVAL_MS = 15 * 1000; // 15 seconds
export const PING_TIMEOUT_MS = 30 * 1000; // 30 seconds

export const PAIRING_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

export const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

export const RETENTION_OPTIONS = [
  { hours: 1, label: '1 Jam' },
  { hours: 24, label: '24 Jam (1 Hari)' },
  { hours: 168, label: '7 Hari (1 Minggu)' },
];
