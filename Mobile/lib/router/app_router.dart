import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../features/kirim/kirim_screen.dart';
import '../features/pairing/pairing_screen.dart';
import '../features/pengaturan/pengaturan_screen.dart';
import '../features/perangkat/perangkat_screen.dart';
import '../features/riwayat/riwayat_screen.dart';
import '../shared/theme/app_theme.dart';

final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<NavigatorState> _shellNavigatorKey = GlobalKey<NavigatorState>();

final appRouter = GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: '/kirim',
  routes: [
    ShellRoute(
      navigatorKey: _shellNavigatorKey,
      builder: (context, state, child) {
        return ScaffoldWithNavBar(child: child);
      },
      routes: [
        GoRoute(
          path: '/kirim',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: KirimScreen(),
          ),
        ),
        GoRoute(
          path: '/riwayat',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: RiwayatScreen(),
          ),
        ),
        GoRoute(
          path: '/perangkat',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: PerangkatScreen(),
          ),
        ),
        GoRoute(
          path: '/pengaturan',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: PengaturanScreen(),
          ),
        ),
      ],
    ),
    GoRoute(
      path: '/pasangkan',
      parentNavigatorKey: rootNavigatorKey,
      builder: (context, state) => const PairingScreen(),
    ),
  ],
);

class ScaffoldWithNavBar extends StatelessWidget {
  final Widget child;

  const ScaffoldWithNavBar({super.key, required this.child});

  int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    if (location.startsWith('/kirim')) return 0;
    if (location.startsWith('/riwayat')) return 1;
    if (location.startsWith('/perangkat')) return 2;
    if (location.startsWith('/pengaturan')) return 3;
    return 0;
  }

  void _onItemTapped(int index, BuildContext context) {
    switch (index) {
      case 0:
        context.go('/kirim');
        break;
      case 1:
        context.go('/riwayat');
        break;
      case 2:
        context.go('/perangkat');
        break;
      case 3:
        context.go('/pengaturan');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _calculateSelectedIndex(context);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (idx) => _onItemTapped(idx, context),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.send_outlined),
            selectedIcon: Icon(Icons.send_rounded),
            label: 'Kirim',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history_rounded),
            label: 'Riwayat',
          ),
          NavigationDestination(
            icon: Icon(Icons.laptop_mac_outlined),
            selectedIcon: Icon(Icons.laptop_mac_rounded),
            label: 'Perangkat',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings_rounded),
            label: 'Pengaturan',
          ),
        ],
      ),
    );
  }
}
