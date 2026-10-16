// SyncBoard Desktop Renderer Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  // Navigation Titles
  const tabTitles = {
    'tab-kirim': {
      title: 'Kirim Data',
      subtitle: 'Kirim teks, tautan, foto, dan berkas ke ponsel secara langsung',
    },
    'tab-riwayat': {
      title: 'Riwayat Transfer',
      subtitle: 'Daftar semua transfer data masuk dan keluar pada perangkat ini',
    },
    'tab-perangkat': {
      title: 'Perangkat Tepercaya',
      subtitle: 'Kelola ponsel Android yang terhubung dan dipasangkan',
    },
    'tab-pengaturan': {
      title: 'Pengaturan Sistem',
      subtitle: 'Konfigurasi server jaringan lokal, folder unduhan, dan privasi',
    },
  };

  // State
  let currentSettings = {};
  let currentNetworkInfo = {};
  let activeQrTimer = null;

  // Initialize
  await loadSettings();
  await loadNetworkInfo();
  await loadDevices();
  await loadTransfers();

  // Tab Switching
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navItems.forEach((n) => n.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.add('active');

      if (tabTitles[targetTab]) {
        pageTitle.textContent = tabTitles[targetTab].title;
        pageSubtitle.textContent = tabTitles[targetTab].subtitle;
      }

      if (targetTab === 'tab-riwayat') loadTransfers();
      if (targetTab === 'tab-perangkat') loadDevices();
    });
  });

  // -------------------------------------------------------------
  // TAB 1: KIRIM (Send Text / File)
  // -------------------------------------------------------------
  const sendTabBtns = document.querySelectorAll('.send-tab-btn');
  const cardSendText = document.getElementById('card-send-text');
  const cardSendFile = document.getElementById('card-send-file');
  const textInput = document.getElementById('text-input');
  const textCharCount = document.getElementById('text-char-count');
  const linkDetectedBadge = document.getElementById('link-detected-badge');
  const btnSendText = document.getElementById('btn-send-text');

  // Switch between text and file sending
  sendTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      sendTabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const sendType = btn.getAttribute('data-send-type');

      if (sendType === 'text') {
        cardSendText.style.display = 'block';
        cardSendFile.style.display = 'none';
        textInput.focus();
      } else {
        cardSendText.style.display = 'none';
        cardSendFile.style.display = 'block';
      }
    });
  });

  // Text / Link input detection & byte count
  textInput.addEventListener('input', () => {
    const val = textInput.value;
    const byteLength = new Blob([val]).size;
    textCharCount.textContent = `${val.length} karakter (${formatBytes(byteLength)})`;

    // Detect URL / Link
    const isUrl = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(val.trim());
    linkDetectedBadge.style.display = isUrl ? 'inline-block' : 'none';
  });

  btnSendText.addEventListener('click', async () => {
    const val = textInput.value;
    if (!val || !val.trim()) {
      showToast('Silakan masukkan teks atau tautan terlebih dahulu.');
      return;
    }

    const isUrl = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(val.trim());
    const kind = isUrl ? 'link' : 'text';

    try {
      const res = await window.syncboard.sendText({ text: val, kind });
      if (res && res.error) {
        showToast(`Gagal mengirim: ${res.error}`);
      } else {
        showToast('Pesan berhasil dikirim!');
        textInput.value = '';
        textCharCount.textContent = '0 karakter (0 byte)';
        linkDetectedBadge.style.display = 'none';
        loadTransfers();
      }
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  });

  // File Drop Zone & Selection
  const dropZone = document.getElementById('file-drop-zone');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const selectedFilePreview = document.getElementById('selected-file-preview');
  const selectedFileName = document.getElementById('selected-file-name');
  const selectedFileSize = document.getElementById('selected-file-size');
  const btnRemoveSelectedFile = document.getElementById('btn-remove-selected-file');
  const fileSendAction = document.getElementById('file-send-action');
  const btnSendFile = document.getElementById('btn-send-file');

  let currentSelectedFilePath = null;

  btnBrowseFile.addEventListener('click', async () => {
    const filePath = await window.syncboard.selectFileToSend();
    if (filePath) {
      handleSelectedFile(filePath);
    }
  });

  btnRemoveSelectedFile.addEventListener('click', () => {
    clearSelectedFile();
  });

  // Drag and Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.path) {
        handleSelectedFile(file.path, file.name, file.size);
      }
    }
  });

  function handleSelectedFile(filePath, name, size) {
    currentSelectedFilePath = filePath;
    const parts = filePath.replace(/\\/g, '/').split('/');
    selectedFileName.textContent = name || parts[parts.length - 1];
    selectedFileSize.textContent = size ? formatBytes(size) : 'Berkas Siap';
    dropZone.style.display = 'none';
    selectedFilePreview.style.display = 'flex';
    fileSendAction.style.display = 'flex';
  }

  function clearSelectedFile() {
    currentSelectedFilePath = null;
    dropZone.style.display = 'block';
    selectedFilePreview.style.display = 'none';
    fileSendAction.style.display = 'none';
  }

  btnSendFile.addEventListener('click', async () => {
    if (!currentSelectedFilePath) return;
    try {
      const res = await window.syncboard.sendFile({ filePath: currentSelectedFilePath });
      if (res && res.error) {
        showToast(`Gagal: ${res.error}`);
      } else {
        showToast('Berkas sedang dikirim...');
        clearSelectedFile();
        loadTransfers();
      }
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  });

  // -------------------------------------------------------------
  // TAB 2: RIWAYAT (History)
  // -------------------------------------------------------------
  const transferListContainer = document.getElementById('transfer-list-container');
  const emptyHistoryState = document.getElementById('empty-history-state');
  const historySearch = document.getElementById('history-search');
  const filterPills = document.querySelectorAll('.filter-pill');

  let currentFilter = 'all';

  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter');
      loadTransfers();
    });
  });

  historySearch.addEventListener('input', () => {
    loadTransfers();
  });

  async function loadTransfers() {
    try {
      const items = await window.syncboard.getTransfers({
        kind: currentFilter,
        search: historySearch.value,
      });

      if (!items || items.length === 0) {
        transferListContainer.innerHTML = '';
        transferListContainer.appendChild(emptyHistoryState);
        emptyHistoryState.style.display = 'block';
        return;
      }

      emptyHistoryState.style.display = 'none';
      transferListContainer.innerHTML = '';

      items.forEach((item) => {
        const card = createTransferCard(item);
        transferListContainer.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load transfers:', err);
    }
  }

  function createTransferCard(item) {
    const card = document.createElement('div');
    card.className = 'transfer-card';

    const isIncoming = item.direction === 'incoming';
    const isFile = item.kind === 'file';
    const timeStr = formatTimestamp(item.createdAt);
    const statusClass = item.status.toLowerCase();

    // Direction Icon
    const directionHtml = isIncoming
      ? `<div class="direction-icon direction-incoming" title="Diterima dari ponsel">
           <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
             <line x1="12" y1="5" x2="12" y2="19"></line>
             <polyline points="19 12 12 19 5 12"></polyline>
           </svg>
         </div>`
      : `<div class="direction-icon direction-outgoing" title="Dikirim ke ponsel">
           <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
             <line x1="12" y1="19" x2="12" y2="5"></line>
             <polyline points="5 12 12 5 19 12"></polyline>
           </svg>
         </div>`;

    // Content HTML
    let contentHtml = '';
    if (isFile) {
      contentHtml = `
        <div class="transfer-file-box">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          <strong class="font-mono">${escapeHtml(item.fileName || 'Berkas')}</strong>
          <span class="file-size">(${formatBytes(item.fileSize || 0)})</span>
        </div>
      `;
    } else {
      contentHtml = `<div class="transfer-body-text">${escapeHtml(item.textBody || '')}</div>`;
    }

    // Actions HTML
    let actionsHtml = '';
    if (!isFile && item.textBody) {
      actionsHtml += `
        <button class="btn btn-secondary btn-sm btn-copy-text" data-text="${encodeURIComponent(item.textBody)}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Salin</span>
        </button>
      `;
    }

    if (isFile && item.savedPath && item.status === 'Selesai') {
      actionsHtml += `
        <button class="btn btn-secondary btn-sm btn-open-folder" data-path="${encodeURIComponent(item.savedPath)}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Buka Folder</span>
        </button>
      `;
    }

    actionsHtml += `
      <button class="btn btn-ghost btn-icon btn-pin-transfer" data-id="${item.id}" data-pinned="${item.pinned}" title="${item.pinned ? 'Lepas Sematan' : 'Sematkan'}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="${item.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-2l-2-2V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v7l-2 2v2z"></path>
        </svg>
      </button>
      <button class="btn btn-ghost btn-icon btn-delete-transfer" data-id="${item.id}" title="Hapus dari Riwayat">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    card.innerHTML = `
      <div class="transfer-main">
        ${directionHtml}
        <div class="transfer-content-col">
          <div class="transfer-header-row">
            <span class="transfer-device">${escapeHtml(item.deviceName || 'Ponsel')}</span>
            <span class="status-tag ${statusClass}">${item.status}</span>
            <span class="transfer-time">${timeStr}</span>
          </div>
          ${contentHtml}
        </div>
      </div>
      <div class="transfer-actions">
        ${actionsHtml}
      </div>
    `;

    // Event listeners on buttons
    const btnCopy = card.querySelector('.btn-copy-text');
    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const textToCopy = decodeURIComponent(btnCopy.getAttribute('data-text'));
        await window.syncboard.copyToClipboard(textToCopy);
        showToast('Teks berhasil disalin ke papan klip!');
      });
    }

    const btnFolder = card.querySelector('.btn-open-folder');
    if (btnFolder) {
      btnFolder.addEventListener('click', async () => {
        const filePath = decodeURIComponent(btnFolder.getAttribute('data-path'));
        await window.syncboard.openFileLocation(filePath);
      });
    }

    const btnPin = card.querySelector('.btn-pin-transfer');
    if (btnPin) {
      btnPin.addEventListener('click', async () => {
        const id = btnPin.getAttribute('data-id');
        const isPinned = parseInt(btnPin.getAttribute('data-pinned'), 10);
        await window.syncboard.pinTransfer(id, isPinned ? 0 : 1);
        loadTransfers();
      });
    }

    const btnDelete = card.querySelector('.btn-delete-transfer');
    if (btnDelete) {
      btnDelete.addEventListener('click', async () => {
        const id = btnDelete.getAttribute('data-id');
        await window.syncboard.deleteTransfer(id);
        loadTransfers();
      });
    }

    return card;
  }

  // -------------------------------------------------------------
  // TAB 3: PERANGKAT (Devices)
  // -------------------------------------------------------------
  const pairedDevicesContainer = document.getElementById('paired-devices-container');
  const overviewDeviceName = document.getElementById('overview-device-name');
  const overviewServerPort = document.getElementById('overview-server-port');
  const overviewIpList = document.getElementById('overview-ip-list');
  const overviewCertFp = document.getElementById('overview-cert-fp');
  const btnCopyFp = document.getElementById('btn-copy-fp');
  const deviceCountBadge = document.getElementById('device-count-badge');

  btnCopyFp.addEventListener('click', async () => {
    if (currentNetworkInfo.certFingerprint) {
      await window.syncboard.copyToClipboard(currentNetworkInfo.certFingerprint);
      showToast('Fingerprint sertifikat disalin!');
    }
  });

  async function loadNetworkInfo() {
    try {
      currentNetworkInfo = await window.syncboard.getNetworkInfo();
      overviewDeviceName.textContent = currentNetworkInfo.deviceName || '-';
      overviewServerPort.textContent = currentNetworkInfo.serverPort || '48620';
      document.getElementById('sidebar-port').textContent = currentNetworkInfo.serverPort || '48620';

      const hosts = currentNetworkInfo.hosts || [];
      overviewIpList.textContent = hosts.length > 0 ? hosts.join(', ') : 'Tidak ada IP terdeteksi';
      overviewCertFp.textContent = currentNetworkInfo.certFingerprint || '-';
    } catch (err) {
      console.error('Failed to load network info:', err);
    }
  }

  async function loadDevices() {
    try {
      const devices = await window.syncboard.getDevices();
      deviceCountBadge.textContent = devices ? devices.length : 0;
      pairedDevicesContainer.innerHTML = '';

      if (!devices || devices.length === 0) {
        pairedDevicesContainer.innerHTML = `
          <div class="empty-state">
            <p>Belum ada ponsel yang dipasangkan. Klik <strong>"Pasangkan Perangkat Baru"</strong> untuk memindai kode QR.</p>
          </div>
        `;
        return;
      }

      devices.forEach((dev) => {
        const devCard = document.createElement('div');
        devCard.className = 'device-card';
        devCard.innerHTML = `
          <div class="device-info-col">
            <div class="device-icon-box">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
              </svg>
            </div>
            <div>
              <h4 class="device-name-title">${escapeHtml(dev.name)}</h4>
              <span class="device-meta font-mono">ID: ${escapeHtml(dev.id.slice(0, 13))}... • Dipasangkan: ${formatDate(dev.pairedAt)}</span>
            </div>
          </div>
          <div class="transfer-actions">
            <button class="btn btn-secondary btn-sm btn-disconnect-dev" data-id="${dev.id}">Putuskan</button>
            <button class="btn btn-ghost btn-danger-tone btn-sm btn-remove-dev" data-id="${dev.id}">Hapus Pasangan</button>
          </div>
        `;

        const btnDisc = devCard.querySelector('.btn-disconnect-dev');
        btnDisc.addEventListener('click', async () => {
          await window.syncboard.disconnectDevice(dev.id);
          showToast(`Koneksi dengan ${dev.name} diputuskan.`);
          loadDevices();
        });

        const btnRem = devCard.querySelector('.btn-remove-dev');
        btnRem.addEventListener('click', async () => {
          if (confirm(`Yakin ingin menghapus ${dev.name} dari daftar perangkat tepercaya? Kunci rahasia akan dihapus.`)) {
            await window.syncboard.removeDevice(dev.id);
            showToast(`${dev.name} dihapus dari perangkat tepercaya.`);
            loadDevices();
          }
        });

        pairedDevicesContainer.appendChild(devCard);
      });
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  }

  // -------------------------------------------------------------
  // TAB 4: PENGATURAN (Settings)
  // -------------------------------------------------------------
  const settingServerPort = document.getElementById('setting-server-port');
  const settingDeviceName = document.getElementById('setting-device-name');
  const settingDownloadPath = document.getElementById('setting-download-path');
  const settingAutoAccept = document.getElementById('setting-auto-accept');
  const settingRetentionHours = document.getElementById('setting-retention-hours');
  const btnChangeDownloadDir = document.getElementById('btn-change-download-dir');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const radioCards = document.querySelectorAll('.radio-card');
  const retentionRow = document.getElementById('retention-selector-row');

  // Radio cards for History Mode
  radioCards.forEach((card) => {
    card.addEventListener('click', () => {
      radioCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      radio.checked = true;

      const mode = card.getAttribute('data-mode');
      retentionRow.style.display = mode === 'kirim_sekali' ? 'flex' : 'none';
    });
  });

  async function loadSettings() {
    try {
      currentSettings = await window.syncboard.getSettings();
      settingServerPort.value = currentSettings.serverPort || '48620';
      settingDeviceName.value = currentSettings.deviceName || 'SyncBoard Desktop';
      settingDownloadPath.textContent = currentSettings.downloadDir || '~/Downloads/SyncBoard';
      settingAutoAccept.checked = currentSettings.autoAcceptFiles === 'true';

      const mode = currentSettings.historyMode || 'simpan';
      radioCards.forEach((card) => {
        const isMatch = card.getAttribute('data-mode') === mode;
        card.classList.toggle('active', isMatch);
        card.querySelector('input[type="radio"]').checked = isMatch;
      });
      retentionRow.style.display = mode === 'kirim_sekali' ? 'flex' : 'none';

      settingRetentionHours.value = currentSettings.retentionHours || '24';
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  btnChangeDownloadDir.addEventListener('click', async () => {
    const selected = await window.syncboard.selectDownloadDir();
    if (selected) {
      settingDownloadPath.textContent = selected;
      showToast('Folder unduhan berhasil diperbarui!');
    }
  });

  btnSaveSettings.addEventListener('click', async () => {
    const port = settingServerPort.value.trim();
    const name = settingDeviceName.value.trim();
    const autoAccept = settingAutoAccept.checked ? 'true' : 'false';
    const selectedRadio = document.querySelector('input[name="history-mode"]:checked');
    const mode = selectedRadio ? selectedRadio.value : 'simpan';
    const retention = settingRetentionHours.value;

    await window.syncboard.saveSetting('serverPort', port);
    await window.syncboard.saveSetting('deviceName', name);
    await window.syncboard.saveSetting('autoAcceptFiles', autoAccept);
    await window.syncboard.saveSetting('historyMode', mode);
    await window.syncboard.saveSetting('retentionHours', retention);

    showToast('Semua pengaturan berhasil disimpan!');
    await loadSettings();
    await loadNetworkInfo();
  });

  // -------------------------------------------------------------
  // MODAL: PAIRING QR CODE & VERIFICATION
  // -------------------------------------------------------------
  const modalPairing = document.getElementById('modal-pairing');
  const btnOpenPairingModal = document.getElementById('btn-open-pairing-modal');
  const btnDevicePairAction = document.getElementById('btn-device-pair-action');
  const btnClosePairingModal = document.getElementById('btn-close-pairing-modal');
  const pairingQrView = document.getElementById('pairing-qr-view');
  const pairingVerifyView = document.getElementById('pairing-verify-view');
  const pairingQrImg = document.getElementById('pairing-qr-img');
  const qrTimer = document.getElementById('qr-timer');

  const openPairingModal = async () => {
    try {
      const session = await window.syncboard.createPairingSession();
      pairingQrImg.src = session.qrDataUrl;
      pairingQrView.style.display = 'block';
      pairingVerifyView.style.display = 'none';
      modalPairing.style.display = 'flex';

      // Start countdown timer
      startQrCountdown(session.expiresAt);
    } catch (err) {
      showToast(`Gagal membuat sesi pemasangan: ${err.message}`);
    }
  };

  btnOpenPairingModal.addEventListener('click', openPairingModal);
  btnDevicePairAction.addEventListener('click', openPairingModal);

  btnClosePairingModal.addEventListener('click', () => {
    modalPairing.style.display = 'none';
    if (activeQrTimer) clearInterval(activeQrTimer);
  });

  function startQrCountdown(expiresAt) {
    if (activeQrTimer) clearInterval(activeQrTimer);

    function update() {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
      const secs = String(remaining % 60).padStart(2, '0');
      qrTimer.textContent = `${mins}:${secs}`;

      if (remaining <= 0) {
        clearInterval(activeQrTimer);
        qrTimer.textContent = 'Kedaluwarsa';
        showToast('Kode QR telah kedaluwarsa. Silakan buka kembali untuk membuat kode baru.');
      }
    }

    update();
    activeQrTimer = setInterval(update, 1000);
  }

  // Event listener for incoming pair request from phone
  window.syncboard.onPairRequest((data) => {
    pairingQrView.style.display = 'none';
    pairingVerifyView.style.display = 'block';
    document.getElementById('verify-phone-name').textContent = data.deviceName || 'Ponsel Android';
    document.getElementById('verify-code-display').textContent = data.verificationCode || '--- ---';

    const btnAccept = document.getElementById('btn-accept-pairing');
    const btnReject = document.getElementById('btn-reject-pairing');

    btnAccept.onclick = async () => {
      await window.syncboard.respondPairRequest({ requestId: data.requestId, accept: true });
      modalPairing.style.display = 'none';
      showToast(`Berhasil memasangkan dengan ${data.deviceName}!`);
      loadDevices();
    };

    btnReject.onclick = async () => {
      await window.syncboard.respondPairRequest({ requestId: data.requestId, accept: false });
      modalPairing.style.display = 'none';
      showToast('Permintaan sambungan ditolak.');
    };
  });

  // Global Toast Function
  function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Utilities
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hari ini ${time}`;
    return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${time}`;
  }

  function formatDate(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
