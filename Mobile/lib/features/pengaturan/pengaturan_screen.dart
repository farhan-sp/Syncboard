import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/db/models.dart';
import '../../core/db/settings_provider.dart';
import '../../core/transfers/transfers_provider.dart';
import '../../shared/theme/app_theme.dart';

class PengaturanScreen extends ConsumerWidget {
  const PengaturanScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Pengaturan"),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Section 1: Lokasi Penyimpanan Berkas
          _buildSectionHeader("Penyimpanan"),
          Card(
            child: ListTile(
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.tealPrimary.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.folder_rounded, color: AppColors.tealPrimary),
              ),
              title: const Text("Folder Unduhan Berkas"),
              subtitle: Text(settings.saveFolder),
              trailing: OutlinedButton(
                onPressed: () async {
                  try {
                    final String? selectedDirectory = await FilePicker.platform.getDirectoryPath();
                    if (selectedDirectory != null) {
                      await ref.read(settingsProvider.notifier).updateSaveFolder(selectedDirectory);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text("Folder unduhan diubah ke: $selectedDirectory")),
                        );
                      }
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text("Gagal memilih folder: $e")),
                      );
                    }
                  }
                },
                child: const Text("Ubah", style: TextStyle(fontSize: 12)),
              ),
            ),
          ),

          const SizedBox(height: 20),

          // Section 2: Mode Retensi Riwayat
          _buildSectionHeader("Mode Retensi Riwayat"),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RadioListTile<RetentionMode>(
                    value: RetentionMode.save,
                    groupValue: settings.retentionMode,
                    activeColor: AppColors.tealPrimary,
                    title: const Text("Simpan", style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: const Text("Riwayat transfer disimpan sampai Anda menghapusnya secara manual."),
                    onChanged: (val) {
                      if (val != null) {
                        ref.read(settingsProvider.notifier).updateRetentionMode(val);
                      }
                    },
                  ),
                  const Divider(),
                  RadioListTile<RetentionMode>(
                    value: RetentionMode.sendOnce,
                    groupValue: settings.retentionMode,
                    activeColor: AppColors.tealPrimary,
                    title: const Text("Kirim Sekali", style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: const Text("Teks dan catatan riwayat transfer otomatis dihapus setelah masa retensi."),
                    onChanged: (val) {
                      if (val != null) {
                        ref.read(settingsProvider.notifier).updateRetentionMode(val);
                      }
                    },
                  ),

                  // Duration selector if Kirim Sekali is active
                  if (settings.retentionMode == RetentionMode.sendOnce) ...[
                    const SizedBox(height: 8),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        "Batas Waktu Retensi:",
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(
                        children: [
                          for (final entry in [
                            const MapEntry(15, "15 Menit"),
                            const MapEntry(60, "1 Jam"),
                            const MapEntry(1440, "24 Jam"),
                          ]) ...[
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(entry.value),
                                selected: settings.retentionDurationMinutes == entry.key,
                                selectedColor: AppColors.tealPrimary,
                                labelStyle: TextStyle(
                                  color: settings.retentionDurationMinutes == entry.key
                                      ? Colors.white
                                      : (isDark ? AppColors.slate50 : AppColors.slate900),
                                  fontSize: 12,
                                ),
                                onSelected: (sel) {
                                  if (sel) {
                                    ref.read(settingsProvider.notifier).updateRetentionDuration(entry.key);
                                  }
                                },
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 12),

                  // Mandatory retention note in Indonesian
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.slate900 : AppColors.slate100,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      "Catatan: Menghapus riwayat hanya berlaku di perangkat ini; berkas yang tersimpan tetap ada di penyimpanan.",
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppColors.slate400 : AppColors.slate600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          // Section 3: Konfirmasi Berkas Masuk
          _buildSectionHeader("Persetujuan Berkas"),
          Card(
            child: SwitchListTile(
              activeColor: AppColors.tealPrimary,
              title: const Text("Minta persetujuan sebelum menerima berkas"),
              subtitle: const Text("Tampilkan tawaran Terima / Tolak untuk setiap tawaran berkas masuk dari desktop."),
              value: settings.requireFileConfirmation,
              onChanged: (val) {
                ref.read(settingsProvider.notifier).updateRequireConfirmation(val);
              },
            ),
          ),

          const SizedBox(height: 20),

          // Section 4: Tema Aplikasi
          _buildSectionHeader("Tampilan & Tema"),
          Card(
            child: Column(
              children: ThemeModeOption.values.map((theme) {
                return RadioListTile<ThemeModeOption>(
                  value: theme,
                  groupValue: settings.themeMode,
                  activeColor: AppColors.tealPrimary,
                  title: Text(theme.label),
                  onChanged: (val) {
                    if (val != null) {
                      ref.read(settingsProvider.notifier).updateThemeMode(val);
                    }
                  },
                );
              }).toList(),
            ),
          ),

          const SizedBox(height: 20),

          // Section 5: Aksi Bersihkan Riwayat
          _buildSectionHeader("Data & Privasi"),
          Card(
            child: ListTile(
              leading: const Icon(Icons.delete_outline_rounded, color: AppColors.statusFailed),
              title: const Text("Hapus Semua Riwayat", style: TextStyle(color: AppColors.statusFailed, fontWeight: FontWeight.w600)),
              subtitle: const Text("Kosongkan semua rekaman teks dan aktivitas transfer."),
              onTap: () => _confirmClearHistory(context, ref),
            ),
          ),

          const SizedBox(height: 20),

          // Section 6: Tentang SyncBoard
          _buildSectionHeader("Tentang Aplikasi"),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.sync_alt_rounded, color: AppColors.tealPrimary),
                      SizedBox(width: 8),
                      Text("SyncBoard Mobile", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text("Versi 1.0.0 (Protokol Bersama v1)"),
                  const SizedBox(height: 4),
                  Text(
                    "Pertukaran data dua arah melalui Wi-Fi lokal dengan TLS fingerprint pinning (SHA-256). Tanpa server awan, tanpa akun, tanpa dependensi internet.",
                    style: TextStyle(fontSize: 12, color: isDark ? AppColors.slate400 : AppColors.slate600),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.tealPrimary),
      ),
    );
  }

  void _confirmClearHistory(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Hapus Semua Riwayat?"),
        content: const Text(
          "Menghapus riwayat hanya berlaku di perangkat ini; berkas yang tersimpan tetap ada di penyimpanan.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text("Batal"),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.statusFailed),
            onPressed: () {
              ref.read(transfersProvider.notifier).clearAll();
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Semua riwayat transfer telah dibersihkan")),
              );
            },
            child: const Text("Ya, Hapus"),
          ),
        ],
      ),
    );
  }
}
