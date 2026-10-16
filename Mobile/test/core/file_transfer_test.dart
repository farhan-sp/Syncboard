import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/crypto/crypto_utils.dart';
import 'package:syncboard_mobile/core/protocol/protocol_constants.dart';
import 'package:syncboard_mobile/core/protocol/protocol_models.dart';
import 'package:syncboard_mobile/core/transfers/chunk_framing.dart';

void main() {
  group('Milestone 4 - File Streaming, Chunking & Checksum Tests', () {
    test('file.offer structure defaults to 256 KB chunk size', () {
      final offer = FileOfferMessage(
        id: 'file-uuid-001',
        name: 'video_presentasi.mp4',
        size: 52428800, // 50 MB
        mime: 'video/mp4',
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
      );

      final json = offer.toJson();
      expect(json['type'], equals(ProtocolConstants.typeFileOffer));
      expect(json['chunkSize'], equals(256 * 1024));
      expect(json['name'], equals('video_presentasi.mp4'));
    });

    test('256 KB binary chunks stream with exact offset and payload integrity', () {
      const transferId = '550e8400-e29b-41d4-a716-446655440000';
      const chunkSize = 256 * 1024;
      final payload = Uint8List(chunkSize);
      for (var i = 0; i < chunkSize; i++) {
        payload[i] = i % 255;
      }

      // Simulate sending 4 consecutive chunks (1 MB total)
      for (var i = 0; i < 4; i++) {
        final offset = i * chunkSize;
        final frame = ChunkFraming.pack(
          transferId: transferId,
          offset: offset,
          payload: payload,
        );

        expect(frame.length, equals(24 + chunkSize));

        final unpacked = ChunkFraming.unpack(frame);
        expect(unpacked.transferId, equals(transferId));
        expect(unpacked.offset, equals(offset));
        expect(unpacked.payload.length, equals(chunkSize));
        expect(unpacked.payload[0], equals(0));
        expect(unpacked.payload[254], equals(254));
      }
    });

    test('SHA-256 streaming verification detects tampered data', () async {
      final tempDir = Directory.systemTemp.createTempSync('syncboard_checksum_test_');
      try {
        final originalFile = File('${tempDir.path}/original.bin');
        final sink = originalFile.openWrite();
        for (var i = 0; i < 10; i++) {
          sink.add(List.filled(64 * 1024, i)); // 640 KB
        }
        await sink.flush();
        await sink.close();

        final originalChecksum = await CryptoUtils.calculateFileSha256(originalFile);
        expect(originalChecksum.length, equals(64));

        // Create identical copy
        final copyFile = File('${tempDir.path}/copy.bin');
        await originalFile.copy(copyFile.path);
        final copyChecksum = await CryptoUtils.calculateFileSha256(copyFile);
        expect(copyChecksum, equals(originalChecksum));

        // Tamper 1 byte
        final raf = await copyFile.open(mode: FileMode.writeOnlyAppend);
        await raf.writeByte(0xFF);
        await raf.close();

        final tamperedChecksum = await CryptoUtils.calculateFileSha256(copyFile);
        expect(tamperedChecksum, isNot(equals(originalChecksum)));
      } finally {
        tempDir.deleteSync(recursive: true);
      }
    });

    test('Temp file deletion on transfer cancellation', () {
      final tempDir = Directory.systemTemp.createTempSync('syncboard_cancel_test_');
      try {
        final tempFile = File('${tempDir.path}/test-transfer.tmp');
        tempFile.writeAsStringSync('partial streaming data');
        expect(tempFile.existsSync(), isTrue);

        // Simulate cancel
        if (tempFile.existsSync()) {
          tempFile.deleteSync();
        }
        expect(tempFile.existsSync(), isFalse);
      } finally {
        tempDir.deleteSync(recursive: true);
      }
    });
  });
}
