class ProtocolConstants {
  static const int protocolVersion = 1;
  static const int defaultPort = 48620;
  static const int defaultChunkSize = 256 * 1024; // 256 KB
  static const int pingIntervalSeconds = 15;
  static const int pairTokenTtlSeconds = 120; // 2 minutes

  // Control Message Types (JSON)
  static const String typePairRequest = "pair.request";
  static const String typePairResponse = "pair.response";
  static const String typePairConfirm = "pair.confirm";
  static const String typePairReject = "pair.reject";

  static const String typeAuthHello = "auth.hello";
  static const String typeAuthChallenge = "auth.challenge";
  static const String typeAuthResponse = "auth.response";
  static const String typeAuthOk = "auth.ok";
  static const String typeAuthSuccess = "auth.success";
  static const String typeAuthFailed = "auth.failed";

  static const String typeTextSend = "text.send";
  static const String typeTextAck = "text.ack";

  static const String typeFileOffer = "file.offer";
  static const String typeFileAccept = "file.accept";
  static const String typeFileReject = "file.reject";
  static const String typeFileProgress = "file.progress";
  static const String typeFileDone = "file.done";

  static const String typeTransferCancel = "transfer.cancel";
  static const String typePing = "ping";
  static const String typePong = "pong";

  // Binary Frame Header
  static const int binaryHeaderSize = 24; // 16-byte UUID + 8-byte offset
  static const int uuidByteLength = 16;
  static const int offsetByteLength = 8;
}
