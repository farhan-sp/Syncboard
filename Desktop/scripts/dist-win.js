const fs = require('fs');
const path = require('path');
const os = require('os');
const dns = require('dns');
const { build, Platform } = require('electron-builder');

const PROJECT_DIR = path.resolve(__dirname, '..');
const NSIS_VERSIONS = ['nsis-3.0.4.1', 'nsis-resources-3.4.1'];
const NETWORK_ERROR_PATTERNS = [
  'no such host',
  'enotfound',
  'etimedout',
  'econnrefused',
  'err_internet_disconnected',
  'github.com',
];

function getNsisCacheDirs() {
  const dirs = [];
  if (process.env.ELECTRON_BUILDER_CACHE) {
    dirs.push(path.join(process.env.ELECTRON_BUILDER_CACHE, 'nsis'));
  }
  if (process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'nsis'));
  }
  if (process.env.XDG_CACHE_HOME) {
    dirs.push(path.join(process.env.XDG_CACHE_HOME, 'electron-builder', 'nsis'));
  }
  dirs.push(path.join(os.homedir(), '.cache', 'electron-builder', 'nsis'));
  return dirs;
}

function hasNsisCache() {
  return getNsisCacheDirs().some((nsisDir) =>
    NSIS_VERSIONS.every((entry) => fs.existsSync(path.join(nsisDir, entry)))
  );
}

async function isGithubReachable() {
  try {
    await dns.promises.lookup('github.com');
    return true;
  } catch {
    return false;
  }
}

function isNetworkDownloadError(err) {
  const text = `${err && err.message ? err.message : ''}\n${err && err.stack ? err.stack : ''}`.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

function createBuildConfig() {
  const config = {
    win: {
      signAndEditExecutable: false,
    },
  };

  const localElectronDist = path.join(PROJECT_DIR, 'node_modules', 'electron', 'dist');
  if (fs.existsSync(path.join(localElectronDist, 'electron.exe'))) {
    config.electronDist = localElectronDist;
  }

  return config;
}

async function runWindowsBuild(targetNames, config) {
  await build({
    projectDir: PROJECT_DIR,
    targets: Platform.WINDOWS.createTarget(targetNames),
    config,
  });
}

async function main() {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  const config = createBuildConfig();

  const nsisCached = hasNsisCache();
  const githubReachable = nsisCached ? true : await isGithubReachable();

  if (nsisCached || githubReachable) {
    try {
      await runWindowsBuild(['nsis', 'portable'], config);
      return;
    } catch (err) {
      if (!isNetworkDownloadError(err)) {
        throw err;
      }
      console.warn(
        '[dist:win] Peringatan: Gagal mengunduh komponen NSIS dari GitHub (%s). Beralih ke target offline (zip & dir)...',
        err.message || err
      );
      await runWindowsBuild(['zip', 'dir'], config);
      return;
    }
  }

  console.log(
    '[dist:win] Cache NSIS tidak ditemukan dan github.com tidak terjangkau. Membangun target offline (zip & dir)...'
  );
  await runWindowsBuild(['zip', 'dir'], config);
}

main().catch((err) => {
  console.error('[dist:win] Build Windows gagal:', err);
  process.exitCode = 1;
});
