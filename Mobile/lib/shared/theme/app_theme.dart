import 'package:flutter/material.dart';

class AppColors {
  // Calm teal & blue palette
  static const Color tealPrimary = Color(0xFF0D9488);
  static const Color tealPrimaryDark = Color(0xFF0F766E);
  static const Color tealContainerLight = Color(0xFFCCFBF1);
  static const Color tealContainerDark = Color(0xFF134E4A);

  static const Color blueSecondary = Color(0xFF0284C7);
  static const Color blueContainerLight = Color(0xFFE0F2FE);

  // Neutral slate tones
  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate900 = Color(0xFF0F172A);

  // Status colors
  static const Color statusDone = Color(0xFF10B981);
  static const Color statusSending = Color(0xFF3B82F6);
  static const Color statusWaiting = Color(0xFFF59E0B);
  static const Color statusFailed = Color(0xFFEF4444);
  static const Color statusCancelled = Color(0xFF6B7280);
}

class AppTheme {
  static ThemeData get lightTheme {
    final colorScheme = ColorScheme.light(
      primary: AppColors.tealPrimary,
      onPrimary: Colors.white,
      primaryContainer: AppColors.tealContainerLight,
      onPrimaryContainer: AppColors.tealPrimaryDark,
      secondary: AppColors.blueSecondary,
      onSecondary: Colors.white,
      secondaryContainer: AppColors.blueContainerLight,
      surface: Colors.white,
      onSurface: AppColors.slate900,
      surfaceContainerHighest: AppColors.slate100,
      outline: AppColors.slate200,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.slate50,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColors.slate900,
          fontSize: 20,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: IconThemeData(color: AppColors.slate900),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.slate200, width: 1),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        elevation: 2,
        indicatorColor: AppColors.tealContainerLight,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: AppColors.tealPrimary,
            );
          }
          return const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.normal,
            color: AppColors.slate600,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppColors.tealPrimary);
          }
          return const IconThemeData(color: AppColors.slate600);
        }),
      ),
    );
  }

  static ThemeData get darkTheme {
    final colorScheme = ColorScheme.dark(
      primary: AppColors.tealPrimary,
      onPrimary: Colors.white,
      primaryContainer: AppColors.tealContainerDark,
      onPrimaryContainer: const Color(0xFF99F6E4),
      secondary: const Color(0xFF38BDF8),
      onSecondary: Colors.black,
      surface: AppColors.slate800,
      onSurface: AppColors.slate50,
      surfaceContainerHighest: AppColors.slate700,
      outline: AppColors.slate700,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.slate900,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColors.slate50,
          fontSize: 20,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: IconThemeData(color: AppColors.slate50),
      ),
      cardTheme: CardThemeData(
        color: AppColors.slate800,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.slate700, width: 1),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.slate800,
        elevation: 2,
        indicatorColor: AppColors.tealContainerDark,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Color(0xFF99F6E4),
            );
          }
          return const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.normal,
            color: AppColors.slate400,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: Color(0xFF99F6E4));
          }
          return const IconThemeData(color: AppColors.slate400);
        }),
      ),
    );
  }
}
