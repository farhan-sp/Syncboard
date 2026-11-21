import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'core/db/models.dart';
import 'core/db/settings_provider.dart';
import 'core/share/share_receiver_service.dart';
import 'core/transfers/file_transfer_manager.dart';
import 'core/transfers/transfers_provider.dart';
import 'features/kirim/incoming_file_sheet.dart';
import 'features/kirim/share_confirmation_dialog.dart';
import 'router/app_router.dart';
import 'shared/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID', null);
  runApp(const ProviderScope(child: SyncBoardApp()));
}

class SyncBoardApp extends ConsumerStatefulWidget {
  const SyncBoardApp({super.key});

  @override
  ConsumerState<SyncBoardApp> createState() => _SyncBoardAppState();
}

class _SyncBoardAppState extends ConsumerState<SyncBoardApp> {
  StreamSubscription<SharedContent>? _shareSub;
  StreamSubscription<IncomingFileOfferEvent>? _offerSub;

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

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final fileManager = ref.read(fileTransferManagerProvider);
      _offerSub = fileManager.incomingOfferStream.listen(_handleIncomingFileOffer);
    });
  }

  void _handleIncomingFileOffer(IncomingFileOfferEvent event) {
    final settings = ref.read(settingsProvider);

    if (!settings.requireFileConfirmation) {
      if (!event.decisionCompleter.isCompleted) {
        event.decisionCompleter.complete(true);
      }
      return;
    }

    final navContext = rootNavigatorKey.currentContext;
    if (navContext == null || !navContext.mounted) {
      if (!event.decisionCompleter.isCompleted) {
        event.decisionCompleter.complete(false);
      }
      return;
    }

    showModalBottomSheet(
      context: navContext,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => IncomingFileSheet(
        offer: event.offer,
        senderDeviceName: event.senderDeviceName,
        saveLocation: settings.saveFolder,
        onDecision: (accepted) {
          Navigator.pop(ctx);
          if (!event.decisionCompleter.isCompleted) {
            event.decisionCompleter.complete(accepted);
          }
        },
        onPickLocation: () {
          ScaffoldMessenger.maybeOf(navContext)?.showSnackBar(
            const SnackBar(content: Text("Dapat diubah di tab Pengaturan")),
          );
        },
      ),
    );
  }

  @override
  void dispose() {
    _shareSub?.cancel();
    _offerSub?.cancel();
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
