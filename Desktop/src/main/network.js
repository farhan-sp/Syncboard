const os = require('os');
const { getSetting } = require('./db');
const { DEFAULT_PORT } = require('../shared/constants');

function getLocalIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          interface: name,
          address: net.address,
          netmask: net.netmask,
        });
      }
    }
  }

  // Prioritize typical Wi-Fi / Ethernet prefixes
  addresses.sort((a, b) => {
    const isWlanA = /wlan|wifi|eth|en/i.test(a.interface);
    const isWlanB = /wlan|wifi|eth|en/i.test(b.interface);
    if (isWlanA && !isWlanB) return -1;
    if (!isWlanA && isWlanB) return 1;
    return 0;
  });

  return addresses;
}

function getHostIpList() {
  const addrs = getLocalIPv4Addresses();
  return addrs.map((item) => item.address);
}

function getPlatformTroubleshootingInfo(port) {
  const activePort = port || parseInt(getSetting('serverPort', String(DEFAULT_PORT)) || String(DEFAULT_PORT), 10);
  const platform = process.platform;

  let firewallCmd = '';
  const tips = [
    'Pastikan kedua perangkat (komputer & HP) terhubung ke jaringan Wi-Fi lokal yang sama.',
    'Periksa apakah router mengaktifkan AP Isolation / Client Isolation (fitur yang memblokir komunikasi antar perangkat di Wi-Fi yang sama).',
  ];

  if (platform === 'linux') {
    firewallCmd = `sudo ufw allow ${activePort}/tcp || sudo firewall-cmd --add-port=${activePort}/tcp --permanent`;
    tips.push(`Buka port ${activePort} di firewall Linux dengan perintah ufw atau firewalld.`);
  } else if (platform === 'win32') {
    firewallCmd = `netsh advfirewall firewall add rule name="SyncBoard TLS" dir=in action=allow protocol=TCP localport=${activePort}`;
    tips.push('Pastikan izin jaringan pribadi (Private Network) diberikan pada dialog Windows Defender Firewall.');
  }

  return {
    os: platform,
    port: activePort,
    firewallCmd,
    tips,
  };
}

module.exports = {
  getLocalIPv4Addresses,
  getHostIpList,
  getPlatformTroubleshootingInfo,
};
