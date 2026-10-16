import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/transfers/filename_sanitizer.dart';

void main() {
  group('SyncBoard FileNameSanitizer Tests', () {
    test('Path traversal characters are stripped', () {
      final sanitized = FileNameSanitizer.sanitize('../../etc/passwd');
      expect(sanitized.contains('/'), isFalse);
      expect(sanitized.contains('..'), isFalse);
    });

    test('Windows reserved device names are protected', () {
      final sanitizedCon = FileNameSanitizer.sanitize('CON.txt');
      expect(sanitizedCon, equals('_CON.txt'));

      final sanitizedPrn = FileNameSanitizer.sanitize('prn.pdf');
      expect(sanitizedPrn, equals('_prn.pdf'));

      final sanitizedAux = FileNameSanitizer.sanitize('AUX');
      expect(sanitizedAux, equals('_AUX'));
    });

    test('Illegal filesystem and control characters are replaced', () {
      final sanitized = FileNameSanitizer.sanitize('laporan<keuangan>*2026?.pdf');
      expect(sanitized.contains('<'), isFalse);
      expect(sanitized.contains('>'), isFalse);
      expect(sanitized.contains('*'), isFalse);
      expect(sanitized.contains('?'), isFalse);
    });

    test('Auto-renaming produces non-colliding name on duplicate', () {
      final tempDir = Directory.systemTemp.createTempSync('syncboard_test_');
      try {
        final base = File('${tempDir.path}/catatan.txt')..createSync();
        expect(base.existsSync(), isTrue);

        final unique1 = FileNameSanitizer.getUniqueFile(tempDir, 'catatan.txt');
        expect(unique1.uri.pathSegments.last, equals('catatan (1).txt'));

        unique1.createSync();
        final unique2 = FileNameSanitizer.getUniqueFile(tempDir, 'catatan.txt');
        expect(unique2.uri.pathSegments.last, equals('catatan (2).txt'));
      } finally {
        tempDir.deleteSync(recursive: true);
      }
    });
  });
}
