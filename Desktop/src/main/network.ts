import os from 'os';
import { DEFAULT_PORT } from '../shared/constants';
import { getSetting } from './db';

export interface LocalAddress {
  interface: string;
  address: string;
  netmask: string;
}

export function getLocalIPv4Addresses(): LocalAddress[] {
  const interfaces = os.networkInterfaces();
  const addresses: LocalAddress[] = [];

  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;

    for (const net of ifaceList) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          interface: name,
          address: net.address,
          netmask: net.netmask,
        });
      }
    }
  }

  // Prioritize typical Wi-Fi / LAN interfaces (wlan, wifi, en, eth)
  addresses.sort((a, b) => {
    const isWlanA = /wlan|wifi|eth|en/i.test(a.interface);
    const isWlanB = /wlan|wifi|eth|en/i.test(b.interface);
    if (isWlanA && !isWlanB) return -1;
    if (!isWlanA && isWlanB) return 1;
    return 0;
  });

  return addresses;
}

export function getHostIpList(): string[] {
  return getLocalIPv4Addresses().map((a) => a.address);
}

export function getPlatformTroubleshootingInfo(port?: number) {
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
