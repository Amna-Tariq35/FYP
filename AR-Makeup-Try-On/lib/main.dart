import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'app/app.dart';
import 'app/config/app_config.dart';
import 'app/utils/app_colors.dart';
import 'app/cache/looks_cache.dart';
import 'app/cache/products_cache.dart';
import 'app/cache/favourites_cache.dart';
import 'app/cache/makeup_bag_cache.dart';
import 'app/services/beauty_profile_service.dart';
import 'app/services/foundation_match_service.dart';
import 'app/screens/welcome_screen.dart';
import 'app/screens/camera_permission_screen.dart';
import 'app/screens/try_on_screen.dart';

Future<void> main() async {
  final widgetsBinding = WidgetsFlutterBinding.ensureInitialized();
  FlutterNativeSplash.preserve(widgetsBinding: widgetsBinding);

  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey,
  );

  await _waitForInitialSession();

  final session = Supabase.instance.client.auth.currentSession;

   if (session != null) {
    LooksCache.instance.prefetch(session.user.id);
    FavouritesCache.instance.prefetch(session.user.id);
    FavouritesCache.instance.listenRealtime(session.user.id);
    MakeupBagCache.instance.prefetch(session.user.id);
    MakeupBagCache.instance.listenRealtime(session.user.id); // 🆕 Add this
  }
  // The product catalog is public, so it warms up regardless of sign-in state.
  // Fire-and-forget: nothing on the critical path waits for it.
  ProductsCache.instance.prefetch();

  Widget initialScreen;
  if (session != null) {
    final cameraStatus = await Permission.camera.status;
    initialScreen = cameraStatus.isGranted
        ? const TryOnScreen()
        : const CameraPermissionScreen();
  } else {
    initialScreen = const WelcomeScreen();
  }

  Supabase.instance.client.auth.onAuthStateChange.listen((data) {
    if (data.event == AuthChangeEvent.signedOut) {
      LooksCache.instance.clear();
      FavouritesCache.instance.clear();
      MakeupBagCache.instance.clear();
      BeautyProfileService.clearCache();
      // The next person to sign in on this phone must not inherit the previous
      // user's measured skin tone — it would silently re-sort their foundation
      // list against somebody else's face.
      FoundationMatchService.clearCache();
    }
     // 🆕 Add this
  if (data.event == AuthChangeEvent.tokenRefreshed && data.session != null) {
    Supabase.instance.client.realtime.setAuth(data.session!.accessToken);
  }
  });
  

  await AppColors.initTheme();

  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(
    SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness:
          AppColors.isDark ? Brightness.light : Brightness.dark,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarIconBrightness:
          AppColors.isDark ? Brightness.light : Brightness.dark,
    ),
  );

  // Remove splash as soon as possible
  FlutterNativeSplash.remove();

  runApp(ProviderScope(child: MyApp(initialScreen: initialScreen)));
}

Future<void> _waitForInitialSession() async {
  final completer = Completer<void>();

  final sub = Supabase.instance.client.auth.onAuthStateChange.listen((data) {
    if (data.event == AuthChangeEvent.initialSession) {
      if (!completer.isCompleted) completer.complete();
    }
  });

  await completer.future.timeout(
    const Duration(seconds: 3),
    onTimeout: () {},
  );

  await sub.cancel();
}

class MyApp extends StatelessWidget {
  final Widget initialScreen;
  const MyApp({super.key, required this.initialScreen});

  @override
  Widget build(BuildContext context) {
    return AppRoot(initialScreen: initialScreen);
  }
}