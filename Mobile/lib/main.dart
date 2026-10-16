import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/db/models.dart';
import 'core/db/settings_provider.dart';
import 'core/share/share_receiver_service.dart';
import 'features/kirim/share_confirmation_dialog.dart';
import 'router/app_router.dart';
import 'shared/theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: SyncBoardApp()));
}

class SyncBoardApp extends ConsumerStatefulWidget {
  const SyncBoardApp({super.key});

  @override
  ConsumerState<SyncBoardApp> createState() => _SyncBoardAppState();
}

class _SyncBoardAppState extends ConsumerState<SyncBoardApp> {
  StreamSubscription<SharedContent>? _shareSub;

  @override
  void initState() {
    super.initState();
    ShareReceiverService.init();
    _shareSub = ShareReceiverService.sharedContentStream.listen((sharedContent) {
      final navContext = rootNavigatorKey.currentContext;
      if (navContext != null && navContext.mounted) {
        showDialog(
          context: navContext,
          builder: (ctx) => ShareConfirmationDialog(content: sharedContent),
        );
      }
    });
  }

  @override
  void dispose() {
    _shareSub?.cancel();
    ShareReceiverService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);

    final themeMode = switch (settings.themeMode) {
      ThemeModeOption.system => ThemeMode.system,
      ThemeModeOption.light => ThemeMode.light,
      ThemeModeOption.dark => ThemeMode.dark,
    };

    return MaterialApp.router(
      title: 'SyncBoard',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: appRouter,
    );
  }
}

