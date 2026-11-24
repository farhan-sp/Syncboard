const { Tray, Menu, nativeImage } = require('electron');

let tray = null;

function updateTrayMenu(mainWindow, onQuit) {
  if (!tray) return;

  let isIslandVisible = false;
  let setIslandVisibility = null;
  try {
    const islandModule = require('./island');
    const islandWin = islandModule.getIslandWindow();
    isIslandVisible = Boolean(islandWin && !islandWin.isDestroyed() && islandWin.isVisible());
    setIslandVisibility = islandModule.setIslandVisibility;
  } catch {}

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
        if (setIslandVisibility) {
          setIslandVisibility(!isIslandVisible);
        }
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

function setupTray(mainWindow, onQuit) {
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

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  setupTray,
  updateTrayMenu,
  destroyTray,
};
