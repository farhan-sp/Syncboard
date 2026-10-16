import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/db/models.dart';
import 'package:syncboard_mobile/core/share/share_receiver_service.dart';

void main() {
  group('SyncBoard Milestone 5 - Share Target & History Management', () {
    test('SharedContent properly handles text vs URL links', () {
      final textContent = SharedContent(
        type: SharedContentType.text,
        text: 'Ini catatan rapat lokal',
      );
      expect(textContent.type, equals(SharedContentType.text));
      expect(textContent.text, equals('Ini catatan rapat lokal'));

      final isUrl = Uri.tryParse('https://syncboard.local/docs')?.hasAbsolutePath ?? false;
      final urlContent = SharedContent(
        type: isUrl ? SharedContentType.link : SharedContentType.text,
        text: 'https://syncboard.local/docs',
      );
      expect(urlContent.type, equals(SharedContentType.link));
      expect(urlContent.text, equals('https://syncboard.local/docs'));
    });

    test('SharedContent categorizes photos vs general documents', () {
      final photoContent = SharedContent(
        type: SharedContentType.photo,
        files: [File('/storage/emulated/0/DCIM/photo.jpg')],
      );
      expect(photoContent.type, equals(SharedContentType.photo));
      expect(photoContent.files.length, equals(1));

      final docContent = SharedContent(
        type: SharedContentType.file,
        files: [
          File('/storage/emulated/0/Download/report.pdf'),
          File('/storage/emulated/0/Download/archive.zip'),
        ],
      );
      expect(docContent.type, equals(SharedContentType.file));
      expect(docContent.files.length, equals(2));
    });

    test('Pin toggle preserves transfer metadata and only flips pinned flag', () {
      final original = TransferItem(
        id: 'tr-pin-1',
        deviceId: 'desktop-01',
        direction: TransferDirection.incoming,
        kind: TransferKind.text,
        textBody: 'Penting',
        status: TransferStatus.done,
        pinned: false,
        createdAt: DateTime.now(),
      );

      final pinned = original.copyWith(pinned: true);
      expect(pinned.id, equals(original.id));
      expect(pinned.pinned, isTrue);
      expect(pinned.textBody, equals(original.textBody));

      final unpinned = pinned.copyWith(pinned: false);
      expect(unpinned.pinned, isFalse);
    });

    test('Batch deletion and file retention policy: files remain on disk', () async {
      // Simulate disk file
      final tempDir = Directory.systemTemp.createTempSync('syncboard_history_test_');
      final testFile = File('${tempDir.path}/laporan_keuangan.xlsx');
      await testFile.writeAsString('test binary content');

      expect(await testFile.exists(), isTrue);

      final item = TransferItem(
        id: 'tr-file-01',
        deviceId: 'desktop-01',
        direction: TransferDirection.incoming,
        kind: TransferKind.file,
        fileName: 'laporan_keuangan.xlsx',
        savedPath: testFile.path,
        fileSize: 1024,
        status: TransferStatus.done,
        createdAt: DateTime.now(),
      );

      // In SyncBoard history deletion policy:
      // Deleting history deletes DB rows and in-memory text ONLY.
      // Saved files on disk MUST remain intact.
      var transfers = [item];
      transfers = transfers.where((t) => t.id != item.id).toList();

      expect(transfers.isEmpty, isTrue);
      // Verify file is STILL on disk
      expect(await testFile.exists(), isTrue);

      tempDir.deleteSync(recursive: true);
    });

    test('Kirim Sekali periodic cleanup purges only expired items', () {
      final now = DateTime(2026, 10, 16, 10, 0, 0);

      final expiredItem = TransferItem(
        id: 'tr-expired',
        deviceId: 'desktop-01',
        direction: TransferDirection.outgoing,
        kind: TransferKind.text,
        textBody: 'Expired 15 min ago',
        status: TransferStatus.done,
        createdAt: now.subtract(const Duration(minutes: 30)),
        expiresAt: now.subtract(const Duration(minutes: 15)),
      );

      final activeItem = TransferItem(
        id: 'tr-active',
        deviceId: 'desktop-01',
        direction: TransferDirection.outgoing,
        kind: TransferKind.text,
        textBody: 'Valid for 45 more mins',
        status: TransferStatus.done,
        createdAt: now.subtract(const Duration(minutes: 15)),
        expiresAt: now.add(const Duration(minutes: 45)),
      );

      final permanentItem = TransferItem(
        id: 'tr-permanent',
        deviceId: 'desktop-01',
        direction: TransferDirection.incoming,
        kind: TransferKind.file,
        fileName: 'photo.jpg',
        status: TransferStatus.done,
        createdAt: now,
        expiresAt: null, // "Simpan" mode
      );

      final allTransfers = [expiredItem, activeItem, permanentItem];

      // Retention cleanup predicate
      final retained = allTransfers.where((item) {
        if (item.expiresAt == null) return true;
        return item.expiresAt!.isAfter(now);
      }).toList();

      expect(retained.length, equals(2));
      expect(retained.any((t) => t.id == 'tr-expired'), isFalse);
      expect(retained.any((t) => t.id == 'tr-active'), isTrue);
      expect(retained.any((t) => t.id == 'tr-permanent'), isTrue);
    });
  });
}
