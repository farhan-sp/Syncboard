# Proguard / R8 rules for SyncBoard Mobile Release Builds

# Flutter Core & Plugins
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Flutter Secure Storage (Android Keystore bindings)
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Flutter Foreground Task Service
-keep class com.pravera.flutter_foreground_task.** { *; }

# Mobile Scanner (MLKit / CameraX)
-keep class dev.steenbakker.mobile_scanner.** { *; }

# Sqflite
-keep class com.tekartik.sqflite.** { *; }

# Receive Sharing Intent
-keep class com.kasem.receive_sharing_intent.** { *; }

# Open Filex & File Picker
-keep class com.crazecoder.openfile.** { *; }
-keep class com.mr.flutter.plugin.filepicker.** { *; }

# Kotlin Coroutines
-keep class kotlinx.coroutines.** { *; }
