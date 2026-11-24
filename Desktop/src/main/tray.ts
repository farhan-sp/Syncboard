import { Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import { getIslandWindow, setIslandVisibility } from './island';

let tray: Tray | null = null;

export function updateTrayMenu(mainWindow: BrowserWindow, onQuit: () => void) {
  if (!tray) return;

  const islandWin = getIslandWindow();
  const isIslandVisible = Boolean(islandWin && !islandWin.isDestroyed() && islandWin.isVisible());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Buka SyncBoard',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: isIslandVisible ? 'Sembunyikan Island' : 'Tampilkan Island',
      click: () => {
        setIslandVisibility(!isIslandVisible);
        updateTrayMenu(mainWindow, onQuit);
      },
    },
    {
      label: 'Status: Server TLS Aktif',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Keluar',
      click: () => {
        onQuit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

export function setupTray(mainWindow: BrowserWindow, onQuit: () => void) {
  if (tray) return tray;

  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAYgz4//8/AxZ1DEyMTChyTFCMzQA0uQxUgzYwMDAwMLIxMhKnGBuACRhGFtCEhSEqGFiJdQA+v5DjyEKYkYyMjAx4XUHOu5R4nxgDkL0OM0yJ9wEAAZon2jI6p4AAAAAASUVORK5CYII=',
      'base64'
    )
  );

  tray = new Tray(icon);
  tray.setToolTip('SyncBoard Desktop - Lokal Wi-Fi P2P');

  updateTrayMenu(mainWindow, onQuit);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  tray.on('right-click', () => {
    updateTrayMenu(mainWindow, onQuit);
  });

  return tray;
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export default {
  setupTray,
  updateTrayMenu,
  destroyTray,
};
