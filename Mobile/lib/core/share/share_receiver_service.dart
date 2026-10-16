import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

enum SharedContentType { text, link, photo, file }

class SharedContent {
  final SharedContentType type;
  final String? text;
  final List<File> files;

  SharedContent({
    required this.type,
    this.text,
    this.files = const [],
  });
}

class ShareReceiverService {
  static StreamSubscription? _intentSubscription;
  static final StreamController<SharedContent> _sharedContentController =
      StreamController<SharedContent>.broadcast();

  static Stream<SharedContent> get sharedContentStream => _sharedContentController.stream;

  /// Initializes listening to Android Share Target intents (ACTION_SEND and ACTION_SEND_MULTIPLE)
  static void init() {
    // 1. Listen for new intents while app is running
    _intentSubscription = ReceiveSharingIntent.instance.getMediaStream().listen(
      (List<SharedMediaFile> mediaList) {
        if (mediaList.isNotEmpty) {
          _processMediaList(mediaList);
        }
      },
      onError: (err) {},
    );

    // 2. Handle initial intent when app was launched from Share sheet
    ReceiveSharingIntent.instance.getInitialMedia().then((List<SharedMediaFile> mediaList) {
      if (mediaList.isNotEmpty) {
        _processMediaList(mediaList);
        ReceiveSharingIntent.instance.reset();
      }
    });
  }

  static void _processMediaList(List<SharedMediaFile> mediaList) {
    final files = <File>[];
    String? textContent;

    for (final media in mediaList) {
      if (media.type == SharedMediaType.text || media.type == SharedMediaType.url) {
        textContent = media.path;
      } else {
        files.add(File(media.path));
      }
    }

    if (files.isNotEmpty) {
      final isImage = mediaList.any((m) => m.type == SharedMediaType.image);
      _sharedContentController.add(SharedContent(
        type: isImage ? SharedContentType.photo : SharedContentType.file,
        files: files,
      ));
    } else if (textContent != null && textContent.isNotEmpty) {
      final isUrl = Uri.tryParse(textContent)?.hasAbsolutePath ?? false;
      _sharedContentController.add(SharedContent(
        type: isUrl ? SharedContentType.link : SharedContentType.text,
        text: textContent,
      ));
    }
  }

  static void dispose() {
    _intentSubscription?.cancel();
    _sharedContentController.close();
  }
}
