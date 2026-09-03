import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import './utils/app_colors.dart';
import './screens/welcome_screen.dart';
import './screens/camera_permission_screen.dart';
import './screens/try_on_screen.dart';
import '../app/cache/looks_cache.dart'; // LooksCache ke liye import (apna sahi path check kar lein)



class AppRoot extends StatefulWidget {
  final Widget initialScreen; // 🟢 naya
  const AppRoot({super.key, required this.initialScreen});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  late Widget _homeScreen; // 🟢 late — null kabhi nahi hoga

  @override
  void initState() {
    super.initState();
    _homeScreen = widget.initialScreen; // 🟢 turant set, no async needed

    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (!mounted) return;
      if (data.event == AuthChangeEvent.signedOut) {
        setState(() => _homeScreen = const WelcomeScreen());
      }
    });
  }

  // 🟢 _resolveHomeScreen() method bilkul hata do — ab zaroorat nahi

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: AppColors.themeNotifier,
      builder: (context, _, __) {
        return MaterialApp(
          title: 'AR Makeup Try-On',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(/* same as before */),
          home: _homeScreen, // 🟢 ?? _buildSplash() bhi hata do
        );
      },
    );
  }

  // 🟢 _buildSplash() bhi hata sakte ho — ab use nahi hoga
}