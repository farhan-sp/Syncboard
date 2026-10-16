import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/db/models.dart';
import '../../core/transfers/transfers_provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/transfer_status_chip.dart';

enum RiwayatFilter {
  all('Semua'),
  text('Teks'),
  link('Tautan'),
  photo('Foto'),
  file('File'),
  pinned('Disematkan');

  final String label;
  const RiwayatFilter(this.label);
}

class RiwayatScreen extends ConsumerStatefulWidget {
  const RiwayatScreen({super.key});

  @override
  ConsumerState<RiwayatScreen> createState() => _RiwayatScreenState();
}

class _RiwayatScreenState extends ConsumerState<RiwayatScreen> {
  RiwayatFilter _selectedFilter = RiwayatFilter.all;
  String _searchQuery = '';
  final Set<String> _selectedItemIds = {};
  bool _isSelectionMode = false;

  List<TransferItem> _filterItems(List<TransferItem> allItems) {
    return allItems.where((item) {
      // 1. Filter Chip
      switch (_selectedFilter) {
        case RiwayatFilter.all:
          break;
        case RiwayatFilter.text:
          if (item.kind != TransferKind.text) return false;
          break;
        case RiwayatFilter.link:
          if (item.kind != TransferKind.link) return false;
          break;
        case RiwayatFilter.photo:
          if (item.kind != TransferKind.photo) return false;
          break;
        case RiwayatFilter.file:
          if (item.kind != TransferKind.file) return false;
          break;
        case RiwayatFilter.pinned:
          if (!item.pinned) return false;
          break;
      }

      // 2. Search query
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final textMatches = item.textBody?.toLowerCase().contains(query) ?? false;
        final fileMatches = item.fileName?.toLowerCase().contains(query) ?? false;
        if (!textMatches && !fileMatches) return false;
      }

      return true;
    }).toList();
  }

  Map<String, List<TransferItem>> _groupByDate(List<TransferItem> items) {
    final Map<String, List<TransferItem>> groups = {};
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));

    for (final item in items) {
      final itemDate = DateTime(item.createdAt.year, item.createdAt.month, item.createdAt.day);
      String label;
      if (itemDate == today) {
        label = "Hari Ini";
      } else if (itemDate == yesterday) {
        label = "Kemarin";
      } else {
        label = DateFormat('d MMMM yyyy', 'id_ID').format(item.createdAt);
      }
      groups.putIfAbsent(label, () => []).add(item);
    }
    return groups;
  }

  @override
  Widget build(BuildContext context) {
    final allTransfers = ref.watch(transfersProvider);
    final filteredTransfers = _filterItems(allTransfers);
    final pinnedTransfers = filteredTransfers.where((t) => t.pinned).toList();
    final nonPinnedTransfers = filteredTransfers.where((t) => !t.pinned).toList();
    final groupedTransfers = _groupByDate(nonPinnedTransfers);

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: _isSelectionMode
            ? Text("${_selectedItemIds.length} Dipilih")
            : const Text("Riwayat"),
        leading: _isSelectionMode
            ? IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () {
                  setState(() {
                    _isSelectionMode = false;
                    _selectedItemIds.clear();
                  });
                },
              )
            : null,
        actions: [
          if (_isSelectionMode) ...[
            IconButton(
              icon: const Icon(Icons.push_pin_rounded),
              tooltip: "Sematkan / Lepas Sematan",
              onPressed: () {
                for (final id in _selectedItemIds) {
                  ref.read(transfersProvider.notifier).togglePin(id);
                }
                setState(() {
                  _isSelectionMode = false;
                  _selectedItemIds.clear();
                });
              },
            ),
            IconButton(
              icon: const Icon(Icons.delete_rounded, color: AppColors.statusFailed),
              tooltip: "Hapus Dipilih",
              onPressed: () {
                for (final id in _selectedItemIds) {
                  ref.read(transfersProvider.notifier).delete(id);
                }
                setState(() {
                  _isSelectionMode = false;
                  _selectedItemIds.clear();
                });
              },
            ),
          ] else ...[
            if (allTransfers.isNotEmpty)
              IconButton(
                icon: const Icon(Icons.delete_sweep_rounded),
                tooltip: "Hapus Semua",
                onPressed: () => _confirmClearAll(context),
              ),
          ],
        ],
      ),
      body: Column(
        children: [
          // Search Field
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: TextField(
              onChanged: (val) => setState(() => _searchQuery = val.trim()),
              decoration: InputDecoration(
                hintText: "Cari riwayat transfer...",
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                filled: true,
                fillColor: isDark ? AppColors.slate800 : AppColors.slate100,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),

          // Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              children: RiwayatFilter.values.map((f) {
                final isSelected = _selectedFilter == f;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    selected: isSelected,
                    label: Text(f.label),
                    onSelected: (_) => setState(() => _selectedFilter = f),
                    selectedColor: AppColors.tealPrimary,
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : (isDark ? AppColors.slate50 : AppColors.slate900),
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      fontSize: 12,
                    ),
                    checkmarkColor: Colors.white,
                  ),
                );
              }).toList(),
            ),
          ),

          // Retention Explanatory Banner
          Container(
            width: double.infinity,
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: isDark ? AppColors.slate800 : AppColors.slate100,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              "Menghapus riwayat hanya berlaku di perangkat ini; berkas yang tersimpan tetap ada di penyimpanan.",
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppColors.slate400 : AppColors.slate600,
              ),
            ),
          ),

          // Main List
          Expanded(
            child: filteredTransfers.isEmpty
                ? _buildEmptyState(isDark)
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Pinned Section
                      if (pinnedTransfers.isNotEmpty && _selectedFilter != RiwayatFilter.pinned) ...[
                        Row(
                          children: [
                            const Icon(Icons.push_pin_rounded, size: 16, color: AppColors.tealPrimary),
                            const SizedBox(width: 6),
                            Text(
                              "DISEMATKAN (${pinnedTransfers.length})",
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppColors.tealPrimary,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        ...pinnedTransfers.map((item) => _buildTransferTile(item, isDark)),
                        const Divider(height: 24),
                      ],

                      // Date Grouped Sections
                      for (final entry in groupedTransfers.entries) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            entry.key,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: isDark ? AppColors.slate400 : AppColors.slate600,
                            ),
                          ),
                        ),
                        ...entry.value.map((item) => _buildTransferTile(item, isDark)),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildTransferTile(TransferItem item, bool isDark) {
    final isSelected = _selectedItemIds.contains(item.id);

    return Dismissible(
      key: Key(item.id),
      direction: DismissDirection.horizontal,
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        color: AppColors.tealPrimary,
        child: const Icon(Icons.push_pin_rounded, color: Colors.white),
      ),
      secondaryBackground: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        color: AppColors.statusFailed,
        child: const Icon(Icons.delete_rounded, color: Colors.white),
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          ref.read(transfersProvider.notifier).togglePin(item.id);
          return false; // Don't remove tile, just toggle pin
        } else {
          ref.read(transfersProvider.notifier).delete(item.id);
          return true;
        }
      },
      child: Card(
        color: isSelected
            ? AppColors.tealPrimary.withOpacity(0.12)
            : (isDark ? AppColors.slate800 : Colors.white),
        margin: const EdgeInsets.only(bottom: 8),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onLongPress: () {
            setState(() {
              _isSelectionMode = true;
              _selectedItemIds.add(item.id);
            });
          },
          onTap: () {
            if (_isSelectionMode) {
              setState(() {
                if (isSelected) {
                  _selectedItemIds.remove(item.id);
                  if (_selectedItemIds.isEmpty) _isSelectionMode = false;
                } else {
                  _selectedItemIds.add(item.id);
                }
              });
            }
          },
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_isSelectionMode)
                  Checkbox(
                    value: isSelected,
                    onChanged: (val) {
                      setState(() {
                        if (val == true) {
                          _selectedItemIds.add(item.id);
                        } else {
                          _selectedItemIds.remove(item.id);
                        }
                      });
                    },
                  )
                else
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: item.direction == TransferDirection.incoming
                          ? AppColors.tealPrimary.withOpacity(0.12)
                          : AppColors.blueSecondary.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      item.kind == TransferKind.photo
                          ? Icons.image_rounded
                          : (item.kind == TransferKind.file
                              ? Icons.description_rounded
                              : (item.kind == TransferKind.link
                                  ? Icons.link_rounded
                                  : Icons.text_snippet_rounded)),
                      color: item.direction == TransferDirection.incoming
                          ? AppColors.tealPrimary
                          : AppColors.blueSecondary,
                      size: 20,
                    ),
                  ),

                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            item.direction.label,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: item.direction == TransferDirection.incoming
                                  ? AppColors.tealPrimary
                                  : AppColors.blueSecondary,
                            ),
                          ),
                          TransferStatusChip(status: item.status),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.textBody ?? item.fileName ?? "Transfer",
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Text(
                            DateFormat('HH:mm').format(item.createdAt),
                            style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                          ),
                          if (item.fileSize != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              "• ${_formatBytes(item.fileSize!)}",
                              style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                            ),
                          ],
                          const Spacer(),
                          if (item.textBody != null)
                            InkWell(
                              onTap: () {
                                Clipboard.setData(ClipboardData(text: item.textBody!));
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text("Teks berhasil disalin ke papan klip")),
                                );
                              },
                              child: const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                child: Row(
                                  children: [
                                    Icon(Icons.copy_rounded, size: 12, color: AppColors.tealPrimary),
                                    SizedBox(width: 4),
                                    Text("Salin", style: TextStyle(fontSize: 11, color: AppColors.tealPrimary, fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState(bool isDark) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history_toggle_off_rounded, size: 64, color: AppColors.slate400),
            const SizedBox(height: 16),
            const Text(
              "Belum ada riwayat transfer",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            Text(
              "Semua teks, foto, dan berkas yang ditransfer akan tercatat di sini.",
              style: TextStyle(fontSize: 13, color: isDark ? AppColors.slate400 : AppColors.slate600),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  void _confirmClearAll(BuildContext context) {
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
            },
            child: const Text("Ya, Hapus Semua"),
          ),
        ],
      ),
    );
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return "$bytes B";
    if (bytes < 1024 * 1024) return "${(bytes / 1024).toStringAsFixed(1)} KB";
    return "${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB";
  }
}
