const crypto = require('crypto');
const { WINDOWS_RESERVED_NAMES } = require('./constants');

function sanitizeFileName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return 'berkas_syncboard';
  }

  let clean = rawName.replace(/^.*[\\/]/, '');
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
  clean = clean.replace(/[<>:"/\\|?*]/g, '_');
  clean = clean.trim().replace(/^\.+|\.+$/g, '');

  const baseNameWithoutExt = clean.split('.')[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(baseNameWithoutExt)) {
    clean = `_${clean}`;
  }

  if (clean.length === 0) {
    return 'berkas_syncboard';
  }

  return clean;
}

function deriveVerificationCode(pairToken, desktopDeviceId, phoneDeviceId) {
  const raw = `${pairToken}${desktopDeviceId}${phoneDeviceId}`;
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest();
  const num = hash.readUInt32BE(0) % 1000000;
  const padded = String(num).padStart(6, '0');
  return `${padded.slice(0, 3)}-${padded.slice(3)}`;
}

function resolveUniqueFileName(targetDir, fileName, fileExistsFn, pathJoinFn) {
  const join = pathJoinFn || ((...parts) => parts.join('/'));
  const sanitized = sanitizeFileName(fileName);
  let fullPath = join(targetDir, sanitized);

  if (!fileExistsFn(fullPath)) {
    return { finalName: sanitized, fullPath };
  }

  const lastDotIdx = sanitized.lastIndexOf('.');
  const base = lastDotIdx !== -1 ? sanitized.slice(0, lastDotIdx) : sanitized;
  const ext = lastDotIdx !== -1 ? sanitized.slice(lastDotIdx) : '';

  let counter = 1;
  while (counter < 10000) {
    const candidateName = `${base} (${counter})${ext}`;
    const candidatePath = join(targetDir, candidateName);
    if (!fileExistsFn(candidatePath)) {
      return { finalName: candidateName, fullPath: candidatePath };
    }
    counter++;
  }

  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const fallbackName = `${base}_${randomSuffix}${ext}`;
  return { finalName: fallbackName, fullPath: join(targetDir, fallbackName) };
}

module.exports = {
  sanitizeFileName,
  deriveVerificationCode,
  resolveUniqueFileName,
};
