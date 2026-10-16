import crypto from 'crypto';
import { WINDOWS_RESERVED_NAMES } from './constants';

/**
 * Sanitizes a filename to ensure safe storage on Windows and Linux systems.
 * - Strips directory traversal (/ and \)
 * - Removes control characters (ASCII 0-31 and 127)
 * - Removes invalid characters for Windows (<>:"/\|?*)
 * - Renames reserved Windows filenames (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 * - Trims trailing dots and spaces which Windows rejects
 */
export function sanitizeFileName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'berkas_syncboard';
  }

  // Extract basename in case a full path was passed
  let clean = rawName.replace(/^.*[\\/]/, '');

  // Strip control characters (0x00 to 0x1F, 0x7F)
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');

  // Replace invalid filesystem characters with an underscore
  clean = clean.replace(/[<>:"/\\|?*]/g, '_');

  // Trim leading/trailing whitespace and dots
  clean = clean.trim().replace(/^\.+|\.+$/g, '');

  // Check against reserved Windows names (e.g. CON.txt, PRN)
  const baseNameWithoutExt = clean.split('.')[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(baseNameWithoutExt)) {
    clean = `_${clean}`;
  }

  if (clean.length === 0) {
    return 'berkas_syncboard';
  }

  return clean;
}

/**
 * Derives a 6-digit verification code formatted as "482-915"
 * from SHA-256(pairToken + desktopDeviceId + phoneDeviceId).
 */
export function deriveVerificationCode(
  pairToken: string,
  desktopDeviceId: string,
  phoneDeviceId: string
): string {
  const raw = `${pairToken}${desktopDeviceId}${phoneDeviceId}`;
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest();
  const num = hash.readUInt32BE(0) % 1000000;
  const padded = String(num).padStart(6, '0');
  return `${padded.slice(0, 3)}-${padded.slice(3)}`;
}

/**
 * Automatically appends (1), (2), etc. to avoid overwriting existing files.
 */
export function resolveUniqueFileName(
  targetDir: string,
  fileName: string,
  fileExistsFn: (fullPath: string) => boolean,
  pathJoinFn: (...parts: string[]) => string
): { finalName: string; fullPath: string } {
  const sanitized = sanitizeFileName(fileName);
  let fullPath = pathJoinFn(targetDir, sanitized);

  if (!fileExistsFn(fullPath)) {
    return { finalName: sanitized, fullPath };
  }

  const lastDotIdx = sanitized.lastIndexOf('.');
  const base = lastDotIdx !== -1 ? sanitized.slice(0, lastDotIdx) : sanitized;
  const ext = lastDotIdx !== -1 ? sanitized.slice(lastDotIdx) : '';

  let counter = 1;
  while (counter < 10000) {
    const candidateName = `${base} (${counter})${ext}`;
    const candidatePath = pathJoinFn(targetDir, candidateName);
    if (!fileExistsFn(candidatePath)) {
      return { finalName: candidateName, fullPath: candidatePath };
    }
    counter++;
  }

  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const fallbackName = `${base}_${randomSuffix}${ext}`;
  return { finalName: fallbackName, fullPath: pathJoinFn(targetDir, fallbackName) };
}
