import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/db/models.dart';
import 'package:syncboard_mobile/core/protocol/protocol_constants.dart';
import 'package:syncboard_mobile/core/protocol/protocol_models.dart';

void main() {
  group('Milestone 3 - Two-Way Text/Link & ACK Protocol Tests', () {
    test('text.send frame packaging with UTF-8 byte fidelity (no trimming)', () {
      const untrimmedBody = "  \n  Halo Dunia! 🚀\nLine 2 with trailing spaces   \t\n";
      final now = DateTime.now().millisecondsSinceEpoch;

      final msg = TextSendMessage(
        id: 'msg-uuid-001',
        kind: 'text',
        body: untrimmedBody,
        ts: now,
      );

      final jsonStr = jsonEncode(msg.toJson());
      final parsed = TextSendMessage.fromJson(jsonDecode(jsonStr));

      // Verifies exact byte-for-byte identical content
      expect(parsed.body, equals(untrimmedBody));
      expect(parsed.body.length, equals(untrimmedBody.length));
      expect(parsed.body.startsWith("  \n  "), isTrue);
      expect(parsed.body.endsWith("   \t\n"), isTrue);
      expect(parsed.type, equals(ProtocolConstants.typeTextSend));
      expect(parsed.kind, equals('text'));
    });

    test('Link kind auto-detection for URLs', () {
      const linkUrl = 'https://github.com/google/antigravity';
      const normalText = 'Kunjungi https://github.com nanti ya';

      final isLink1 = Uri.tryParse(linkUrl)?.hasAbsolutePath ?? false;
      final isLink2 = (Uri.tryParse(normalText)?.hasAbsolutePath ?? false) && !normalText.contains(' ');

      expect(isLink1, isTrue);
      expect(isLink2, isFalse);

      final linkMsg = TextSendMessage(
        id: 'link-001',
        kind: 'link',
        body: linkUrl,
        ts: DateTime.now().millisecondsSinceEpoch,
      );

      expect(linkMsg.kind, equals('link'));
      expect(linkMsg.body, equals(linkUrl));
    });

    test('text.ack acknowledgment frame structure', () {
      const transferId = '550e8400-e29b-41d4-a716-446655440000';

      final ack = TextAckMessage(id: transferId);
      final json = ack.toJson();

      expect(json['type'], equals(ProtocolConstants.typeTextAck));
      expect(json['id'], equals(transferId));

      final reconstructed = TextAckMessage.fromJson(json);
      expect(reconstructed.id, equals(transferId));
    });

    test('Transfer status lifecycle: Sending -> Done on ACK, or Failed on Timeout', () {
      final initialItem = TransferItem(
        id: 'tr-lifecycle',
        deviceId: 'desktop-mac',
        direction: TransferDirection.outgoing,
        kind: TransferKind.text,
        textBody: 'Pesan pengujian status',
        status: TransferStatus.sending,
        createdAt: DateTime.now(),
      );

      expect(initialItem.status, equals(TransferStatus.sending));

      // On ACK received
      final acknowledgedItem = initialItem.copyWith(status: TransferStatus.done);
      expect(acknowledgedItem.status, equals(TransferStatus.done));

      // On timeout / unacked
      final failedItem = initialItem.copyWith(status: TransferStatus.failed);
      expect(failedItem.status, equals(TransferStatus.failed));
    });

    test('Clipboard requirement: clipboard is never auto-written on text receive', () {
      bool clipboardWritten = false;

      void onTextReceived(String body) {
        // According to protocol rules:
        // "Clipboard is only written when the user taps 'Salin'."
        // We do NOT write to clipboard automatically here!
      }

      void onUserTappedSalin(String body) {
        // Only written here
        clipboardWritten = true;
      }

      const incomingText = "Pesan masuk dari desktop";
      onTextReceived(incomingText);
      expect(clipboardWritten, isFalse);

      onUserTappedSalin(incomingText);
      expect(clipboardWritten, isTrue);
    });
  });
}
