import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart'; // Ye package import karein

class AppColors {
  // Theme state ko globally manage karne ke liye Notifier
  static final ValueNotifier<ThemeMode> themeNotifier = ValueNotifier(ThemeMode.light);

  // Helper method check karne ke liye ke dark mode on hai ya nahi
  static bool get isDark => themeNotifier.value == ThemeMode.dark;

  // 🔴 NAYA FUNCTION: Jo app start hote hi memory read karega
  static Future<void> initTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final isDarkMode = prefs.getBool('is_dark_mode') ?? false;
    themeNotifier.value = isDarkMode ? ThemeMode.dark : ThemeMode.light;
  }

  // Main Brand Colors
  static const Color primary = Color(0xFFC06C84);
  static const Color secondary = Color(0xFFF4C2C2);

  // Background aur Text colors
  static Color get background => isDark ? const Color(0xFF121212) : const Color(0xFFFAF7F5);
  static Color get surface => isDark ? const Color(0xFF1E1E1E) : const Color(0xFFFFFFFF);
  static Color get textMain => isDark ? const Color(0xFFFFFFFF) : const Color(0xFF1F1F1F);
  static Color get textMuted => isDark ? const Color(0xFFA0A0A0) : const Color(0xFF8A8A8A);
  static Color get border => isDark ? Colors.white.withOpacity(0.1) : Colors.black.withOpacity(0.05);

  // ── Accent ────────────────────────────────────────────────────────────────

  /// Selection accent — progress bars, selected chips, active borders.
  ///
  /// Tracks [primary] in light mode so a selected chip and a primary button read
  /// as the same brand rose. Lifted in dark mode because #C06C84 on a #121212
  /// background is too dim to register as "selected".
  static Color get accentPink =>
      isDark ? const Color(0xFFE38FA8) : const Color(0xFFC06C84);

  // ── Neutral ramp ──────────────────────────────────────────────────────────
  //
  // The number is *contrast against the current background*, not brightness:
  // 200 is a fill you can barely see, 700 is comfortable body text. That means
  // the ramp inverts under dark mode — 700 is near-black on the light theme and
  // near-white on the dark one. It looks wrong written down and is right on
  // screen, and it is why callers never have to branch on [isDark] themselves.

  /// Subtle fill — unselected chips, inset panels.
  static Color get neutral200 =>
      isDark ? const Color(0xFF262626) : const Color(0xFFEFEBE8);

  /// Hairline borders and dividers.
  static Color get neutral300 =>
      isDark ? const Color(0xFF383838) : const Color(0xFFDED8D4);

  /// Disabled and placeholder text. Deliberately mid-grey in both themes: a
  /// disabled control should be equally unavailable-looking either way.
  static Color get neutral500 =>
      isDark ? const Color(0xFF8A8A8A) : const Color(0xFF9A9290);

  /// Secondary body text — softer than [textMain], still fully readable.
  static Color get neutral700 =>
      isDark ? const Color(0xFFD4D4D4) : const Color(0xFF4A4442);
}