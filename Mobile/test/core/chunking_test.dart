import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/protocol/protocol_constants.dart';
import 'package:syncboard_mobile/core/transfers/chunk_framing.dart';

void main() {
  group('SyncBoard Binary Chunk Framing Tests', () {
    test('Chunk packing & unpacking round-trip fidelity', () {
      const transferId = '550e8400-e29b-41d4-a716-446655440000';
      const offset = 262144; // 256 KB offset
      final payload = Uint8List(256 * 1024); // 256 KB
      for (var i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }

      // Pack
      final frame = ChunkFraming.pack(
        transferId: transferId,
        offset: offset,
        payload: payload,
      );

      expect(frame.length, ProtocolConstants.binaryHeaderSize + payload.length);
      expect(frame.length, 24 + 262144);

      // Unpack
      final unpacked = ChunkFraming.unpack(frame);

      expect(unpacked.transferId, transferId);
      expect(unpacked.offset, offset);
      expect(unpacked.payload.length, payload.length);
      expect(unpacked.payload[0], payload[0]);
      expect(unpacked.payload[100], payload[100]);
      expect(unpacked.payload.last, payload.last);
    });

    test('Unpacking rejects frame with size < 24 bytes', () {
      final invalidFrame = Uint8List(20);
      expect(
        () => ChunkFraming.unpack(invalidFrame),
        throwsA(isA<ArgumentError>()),
      );
    });
  });
}
