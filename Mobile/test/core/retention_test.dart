import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/db/models.dart';

void main() {
  group('SyncBoard Retention Tests', () {
    test('Kirim Sekali mode calculates expiration timestamp correctly', () {
      final now = DateTime(2026, 10, 16, 12, 0, 0);
      const durationMinutes = 60;

      final expiresAt = now.add(const Duration(minutes: durationMinutes));

      final item = TransferItem(
        id: 'tr-test',
        deviceId: 'desktop-pc',
        direction: TransferDirection.outgoing,
        kind: TransferKind.text,
        textBody: 'Pesan sekali pakai',
        status: TransferStatus.done,
        createdAt: now,
        expiresAt: expiresAt,
      );

      expect(item.expiresAt, isNotNull);
      expect(item.expiresAt, equals(now.add(const Duration(hours: 1))));

      // Verification of expired check predicate
      final beforeExpiry = now.add(const Duration(minutes: 30));
      expect(beforeExpiry.isAfter(item.expiresAt!), isFalse);

      final afterExpiry = now.add(const Duration(minutes: 61));
      expect(afterExpiry.isAfter(item.expiresAt!), isTrue);
    });

    test('Simpan mode leaves expiresAt as null', () {
      final item = TransferItem(
        id: 'tr-saved',
        deviceId: 'desktop-pc',
        direction: TransferDirection.incoming,
        kind: TransferKind.file,
        fileName: 'dokumen.pdf',
        status: TransferStatus.done,
        createdAt: DateTime.now(),
        expiresAt: null,
      );

      expect(item.expiresAt, isNull);
    });
  });
}
