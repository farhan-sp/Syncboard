import 'dart:io';
import 'package:path/path.dart' as p;

class FileNameSanitizer {
  static const _windowsReserved = {
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
  };

  static final _illegalChars = RegExp(r'[/\\:?*"<>|\x00-\x1F\x7F]');

  /// Sanitizes incoming file name by stripping path separators, control characters,
  /// and reserved Windows device names.
  static String sanitize(String rawName, {String defaultName = 'file'}) {
    var name = rawName.trim();

    // Strip path traversal prefixes like ../ or ..\
    name = name.replaceAll('../', '').replaceAll(r'..\', '');

    // Replace illegal characters and separators with underscore
    name = name.replaceAll(_illegalChars, '_');

    // Strip leading/trailing dots or spaces
    name = name.replaceAll(RegExp(r'^[. ]+|[. ]+$'), '');

    if (name.isEmpty) {
      name = defaultName;
    }

    final ext = p.extension(name);
    final base = p.basenameWithoutExtension(name);

    // Prevent Windows reserved device names
    final safeBase = _windowsReserved.contains(base.toUpperCase()) ? '_$base' : base;

    return '$safeBase$ext';
  }

  /// Finds a non-colliding file name in the target directory (e.g. "nama (1).ext").
  static File getUniqueFile(Directory dir, String sanitizedName) {
    var file = File(p.join(dir.path, sanitizedName));
    if (!file.existsSync()) {
      return file;
    }

    final ext = p.extension(sanitizedName);
    final base = p.basenameWithoutExtension(sanitizedName);

    var counter = 1;
    while (file.existsSync()) {
      file = File(p.join(dir.path, '$base ($counter)$ext'));
      counter++;
    }

    return file;
  }
}
