import 'dart:convert';
import 'protocol_constants.dart';

class QrPayload {
  final int v;
  final String deviceId;
  final String deviceName;
  final List<String> hosts;
  final int port;
  final String certFingerprint;
  final String pairToken;
  final int expiresAt;

  QrPayload({
    required this.v,
    required this.deviceId,
    required this.deviceName,
    required this.hosts,
    required this.port,
    required this.certFingerprint,
    required this.pairToken,
    required this.expiresAt,
  });

  factory QrPayload.fromJson(Map<String, dynamic> json) {
    return QrPayload(
      v: json['v'] as int? ?? 1,
      deviceId: json['deviceId'] as String,
      deviceName: json['deviceName'] as String,
      hosts: (json['hosts'] as List<dynamic>).map((e) => e.toString()).toList(),
      port: json['port'] as int? ?? ProtocolConstants.defaultPort,
      certFingerprint: json['certFingerprint'] as String,
      pairToken: json['pairToken'] as String,
      expiresAt: json['expiresAt'] as int,
    );
  }

  Map<String, dynamic> toJson() => {
        'v': v,
        'deviceId': deviceId,
        'deviceName': deviceName,
        'hosts': hosts,
        'port': port,
        'certFingerprint': certFingerprint,
        'pairToken': pairToken,
        'expiresAt': expiresAt,
      };

  bool get isExpired {
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    // expiresAt can be in seconds or milliseconds
    final expirySec = expiresAt > 10000000000 ? expiresAt ~/ 1000 : expiresAt;
    return now >= expirySec;
  }
}

class PairRequestMessage {
  final String type;
  final String deviceId;
  final String deviceName;
  final String pairToken;
  final String clientSecret;

  PairRequestMessage({
    this.type = ProtocolConstants.typePairRequest,
    required this.deviceId,
    required this.deviceName,
    required this.pairToken,
    required this.clientSecret,
  });

  Map<String, dynamic> toJson() => {
        'type': type,
        'deviceId': deviceId,
        'deviceName': deviceName,
        'pairToken': pairToken,
        'clientSecret': clientSecret,
      };
}

class AuthHelloMessage {
  final String type;
  final String deviceId;
  final String nonce;

  AuthHelloMessage({
    this.type = ProtocolConstants.typeAuthHello,
    required this.deviceId,
    required this.nonce,
  });

  Map<String, dynamic> toJson() => {
        'type': type,
        'deviceId': deviceId,
        'nonce': nonce,
      };
}

class AuthChallengeMessage {
  final String type;
  final String challenge;

  AuthChallengeMessage({
    this.type = ProtocolConstants.typeAuthChallenge,
    required this.challenge,
  });

  factory AuthChallengeMessage.fromJson(Map<String, dynamic> json) =>
      AuthChallengeMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeAuthChallenge,
        challenge: json['challenge'] as String,
      );
}

class AuthResponseMessage {
  final String type;
  final String signature;

  AuthResponseMessage({
    this.type = ProtocolConstants.typeAuthResponse,
    required this.signature,
  });

  Map<String, dynamic> toJson() => {
        'type': type,
        'signature': signature,
        'hmac': signature,
      };
}

class TextSendMessage {
  final String type;
  final String id;
  final String kind; // "text" | "link"
  final String body;
  final int ts;

  TextSendMessage({
    this.type = ProtocolConstants.typeTextSend,
    required this.id,
    required this.kind,
    required this.body,
    required this.ts,
  });

  factory TextSendMessage.fromJson(Map<String, dynamic> json) =>
      TextSendMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeTextSend,
        id: json['id'] as String,
        kind: json['kind'] as String? ?? 'text',
        body: json['body'] as String,
        ts: json['ts'] as int,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
        'kind': kind,
        'body': body,
        'ts': ts,
      };
}

class TextAckMessage {
  final String type;
  final String id;

  TextAckMessage({
    this.type = ProtocolConstants.typeTextAck,
    required this.id,
  });

  factory TextAckMessage.fromJson(Map<String, dynamic> json) =>
      TextAckMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeTextAck,
        id: json['id'] as String,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
      };
}

class FileOfferMessage {
  final String type;
  final String id;
  final String name;
  final int size;
  final String mime;
  final String sha256;
  final int chunkSize;

  FileOfferMessage({
    this.type = ProtocolConstants.typeFileOffer,
    required this.id,
    required this.name,
    required this.size,
    required this.mime,
    required this.sha256,
    this.chunkSize = ProtocolConstants.defaultChunkSize,
  });

  factory FileOfferMessage.fromJson(Map<String, dynamic> json) =>
      FileOfferMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeFileOffer,
        id: json['id'] as String,
        name: json['name'] as String,
        size: json['size'] as int,
        mime: json['mime'] as String? ?? 'application/octet-stream',
        sha256: json['sha256'] as String,
        chunkSize: json['chunkSize'] as int? ?? ProtocolConstants.defaultChunkSize,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
        'name': name,
        'size': size,
        'mime': mime,
        'sha256': sha256,
        'chunkSize': chunkSize,
      };
}

class FileAcceptMessage {
  final String type;
  final String id;

  FileAcceptMessage({
    this.type = ProtocolConstants.typeFileAccept,
    required this.id,
  });

  factory FileAcceptMessage.fromJson(Map<String, dynamic> json) =>
      FileAcceptMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeFileAccept,
        id: json['id'] as String,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
      };
}

class FileRejectMessage {
  final String type;
  final String id;
  final String? reason;

  FileRejectMessage({
    this.type = ProtocolConstants.typeFileReject,
    required this.id,
    this.reason,
  });

  factory FileRejectMessage.fromJson(Map<String, dynamic> json) =>
      FileRejectMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeFileReject,
        id: json['id'] as String,
        reason: json['reason'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
        if (reason != null) 'reason': reason,
      };
}

class FileProgressMessage {
  final String type;
  final String id;
  final int bytesReceived;

  FileProgressMessage({
    this.type = ProtocolConstants.typeFileProgress,
    required this.id,
    required this.bytesReceived,
  });

  factory FileProgressMessage.fromJson(Map<String, dynamic> json) =>
      FileProgressMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeFileProgress,
        id: json['id'] as String,
        bytesReceived: json['bytesReceived'] as int,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
        'bytesReceived': bytesReceived,
      };
}

class FileDoneMessage {
  final String type;
  final String id;
  final bool ok;
  final String? reason;

  FileDoneMessage({
    this.type = ProtocolConstants.typeFileDone,
    required this.id,
    required this.ok,
    this.reason,
  });

  factory FileDoneMessage.fromJson(Map<String, dynamic> json) =>
      FileDoneMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeFileDone,
        id: json['id'] as String,
        ok: json['ok'] as bool? ?? false,
        reason: json['reason'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
        'ok': ok,
        if (reason != null) 'reason': reason,
      };
}

class TransferCancelMessage {
  final String type;
  final String id;

  TransferCancelMessage({
    this.type = ProtocolConstants.typeTransferCancel,
    required this.id,
  });

  factory TransferCancelMessage.fromJson(Map<String, dynamic> json) =>
      TransferCancelMessage(
        type: json['type'] as String? ?? ProtocolConstants.typeTransferCancel,
        id: json['id'] as String,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'id': id,
      };
}
