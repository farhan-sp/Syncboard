import 'dart:typed_data';
import 'package:uuid/uuid.dart';
import '../protocol/protocol_constants.dart';

class BinaryChunk {
  final String transferId;
  final int offset;
  final Uint8List payload;

  BinaryChunk({
    required this.transferId,
    required this.offset,
    required this.payload,
  });
}

class ChunkFraming {
  static const _uuid = Uuid();

  /// Packs a transfer ID, byte offset, and payload into a single binary frame.
  /// Frame Header (24 bytes):
  /// [0..15]  : 16-byte Transfer ID (UUID)
  /// [16..23] : 8-byte Big-Endian Offset
  /// [24..N]  : Payload
  static Uint8List pack({
    required String transferId,
    required int offset,
    required Uint8List payload,
  }) {
    final frame = Uint8List(ProtocolConstants.binaryHeaderSize + payload.length);
    final byteData = ByteData.sublistView(frame);

    // 16-byte UUID
    final uuidBytes = _transferIdToBytes(transferId);
    frame.setRange(0, 16, uuidBytes);

    // 8-byte Offset (Big-Endian)
    byteData.setInt64(16, offset, Endian.big);

    // Payload
    frame.setRange(ProtocolConstants.binaryHeaderSize, frame.length, payload);

    return frame;
  }

  /// Unpacks a binary frame into its transfer ID, offset, and payload.
  static BinaryChunk unpack(Uint8List frame) {
    if (frame.length < ProtocolConstants.binaryHeaderSize) {
      throw ArgumentError(
        'Binary frame too short: ${frame.length} bytes (minimum is ${ProtocolConstants.binaryHeaderSize})',
      );
    }

    final byteData = ByteData.sublistView(frame);

    // Read UUID (16 bytes)
    final uuidBytes = frame.sublist(0, 16);
    final transferId = _bytesToTransferId(uuidBytes);

    // Read Offset (8 bytes)
    final offset = byteData.getInt64(16, Endian.big);

    // Payload
    final payload = frame.sublist(ProtocolConstants.binaryHeaderSize);

    return BinaryChunk(
      transferId: transferId,
      offset: offset,
      payload: payload,
    );
  }

  static List<int> _transferIdToBytes(String id) {
    try {
      return Uuid.parse(id);
    } catch (_) {
      // Fallback for hex string or raw ascii
      final clean = id.replaceAll('-', '');
      if (clean.length == 32) {
        final list = <int>[];
        for (var i = 0; i < 32; i += 2) {
          list.add(int.parse(clean.substring(i, i + 2), radix: 16));
        }
        return list;
      }
      final raw = Uint8List(16);
      final encoded = id.codeUnits;
      for (var i = 0; i < 16 && i < encoded.length; i++) {
        raw[i] = encoded[i];
      }
      return raw;
    }
  }

  static String _bytesToTransferId(List<int> bytes) {
    try {
      return Uuid.unparse(bytes);
    } catch (_) {
      final buffer = StringBuffer();
      for (var b in bytes) {
        buffer.write(b.toRadixString(16).padLeft(2, '0'));
      }
      return buffer.toString();
    }
  }
}
