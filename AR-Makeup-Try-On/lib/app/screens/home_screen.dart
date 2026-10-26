import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';
import '../services/web_bridge.dart';
import '../utils/app_colors.dart';
import 'auth_screen.dart';
import 'beauty_profile_questionnaire_screen.dart';
import 'favourites_screen.dart';
import 'foundation_match_screen.dart';
import 'makeup_bag_screen.dart';
import 'notifications_inbox_screen.dart';
import 'profile_screen.dart';
import 'saved_looks_screen.dart';

/// Calm front door. The camera stays the live try-on; this screen only links out.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  bool _signedIn() => Supabase.instance.client.auth.currentUser != null;

  Future<void> _openAccount(
    BuildContext context,
    Widget page,
  ) async {
    if (!_signedIn()) {
      await Navigator.push<void>(
        context,
        MaterialPageRoute(builder: (_) => const AuthScreen(isLoginMode: true)),
      );
      return;
    }
    if (!context.mounted) return;
    final result = await Navigator.push<Object?>(
      context,
      MaterialPageRoute(builder: (_) => page),
    );
    if (!context.mounted) return;
    _forwardToCamera(context, result);
  }

  void _forwardToCamera(BuildContext context, Object? result) {
    if (!context.mounted || result == null) return;
    final backToCamera = result is List ||
        result is FoundationTryOnRequest ||
        result is FoundationLookRequest ||
        result == 'tryOnWithMyBag' ||
        (result is String && result.startsWith('tryOn:'));
    if (backToCamera) Navigator.pop(context, result);
  }

  Future<void> _openSkinCheck(BuildContext context) async {
    final continueToSite = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        content: Text(
          'This opens the website skin check. That photo is sent to build a routine and is not a diagnosis. The try-on camera photo stays on this phone and is not uploaded.',
          style: TextStyle(
            color: AppColors.textMain,
            fontSize: 14,
            height: 1.5,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              'Continue',
              style: TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
    if (continueToSite == true && context.mounted) {
      await WebBridge.openAuthenticated(context, AppConfig.skinAnalysisPath);
    }
  }

  void _backToCamera(BuildContext context) {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    AppColors.watch(context);
    final signedIn = _signedIn();
    final tiles = <_HomeTile>[
      _HomeTile(
        icon: Icons.face_retouching_natural_outlined,
        label: 'Beauty profile',
        onTap: () => _openAccount(context, const BeautyProfileQuestionnaireScreen()),
      ),
      _HomeTile(
        icon: Icons.colorize_rounded,
        label: 'Find my shade',
        onTap: () async {
          final result = await Navigator.push<Object?>(
            context,
            MaterialPageRoute(builder: (_) => const FoundationMatchScreen()),
          );
          if (context.mounted) _forwardToCamera(context, result);
        },
      ),
      _HomeTile(
        icon: Icons.favorite_border_rounded,
        label: 'Favourites',
        onTap: () => _openAccount(context, const FavouritesScreen()),
      ),
      _HomeTile(
        icon: Icons.shopping_bag_outlined,
        label: 'Makeup bag',
        onTap: () => _openAccount(context, const MakeupBagScreen()),
      ),
      _HomeTile(
        icon: Icons.photo_library_outlined,
        label: 'Saved looks',
        onTap: () => _openAccount(context, const SavedLooksScreen()),
      ),
      _HomeTile(
        icon: Icons.spa_outlined,
        label: 'Skin check',
        onTap: () => _openSkinCheck(context),
      ),
      _HomeTile(
        icon: Icons.storefront_outlined,
        label: 'Shop',
        onTap: () => WebBridge.openAuthenticated(context, AppConfig.productsPath),
      ),
      _HomeTile(
        icon: Icons.receipt_long_outlined,
        label: 'My orders',
        onTap: () => _openAccountPage(context, AppConfig.myOrdersPath),
      ),
      _HomeTile(
        icon: Icons.notifications_none_rounded,
        label: 'Notifications',
        onTap: () => _openAccount(context, const NotificationsInboxScreen()),
      ),
    ];

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 20, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.maybePop(context),
                    icon: Icon(Icons.chevron_left, color: AppColors.textMain, size: 28),
                  ),
                  Expanded(
                    child: Text(
                      'Home',
                      style: TextStyle(
                        color: AppColors.textMain,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                physics: const BouncingScrollPhysics(),
                children: [
                  if (!signedIn)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(
                        'Sign in to keep looks, orders, and your bag.',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 15,
                          height: 1.4,
                        ),
                      ),
                    ),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: 1.2,
                    children: [
                      for (final tile in tiles) _HomeTileButton(tile: tile),
                    ],
                  ),
                ],
              ),
            ),
            _HomeBottomBar(
              homeActive: true,
              onTryOn: () => _backToCamera(context),
              onHome: () {},
              onProfile: () async {
                if (!_signedIn()) {
                  await Navigator.push<void>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const AuthScreen(isLoginMode: true),
                    ),
                  );
                  return;
                }
                if (!context.mounted) return;
                final result = await Navigator.push<Object?>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ProfileScreen(openedOverHome: true),
                  ),
                );
                if (context.mounted) _forwardToCamera(context, result);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openAccountPage(BuildContext context, String path) async {
    if (!_signedIn()) {
      await Navigator.push<void>(
        context,
        MaterialPageRoute(builder: (_) => const AuthScreen(isLoginMode: true)),
      );
      return;
    }
    if (!context.mounted) return;
    await WebBridge.openAuthenticated(context, path);
  }
}

class _HomeTile {
  const _HomeTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

class _HomeTileButton extends StatelessWidget {
  const _HomeTileButton({required this.tile});

  final _HomeTile tile;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: tile.onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(tile.icon, color: AppColors.primary, size: 22),
              ),
              const SizedBox(height: 12),
              Text(
                tile.label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: AppColors.textMain,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeBottomBar extends StatelessWidget {
  const _HomeBottomBar({
    required this.homeActive,
    required this.onTryOn,
    required this.onHome,
    required this.onProfile,
  });

  final bool homeActive;
  final VoidCallback onTryOn;
  final VoidCallback onHome;
  final VoidCallback onProfile;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _item(Icons.camera_alt_outlined, 'Try-On', false, onTryOn),
          _item(Icons.home_outlined, 'Home', homeActive, onHome),
          _item(Icons.person_outline, 'Profile', false, onProfile),
        ],
      ),
    );
  }

  Widget _item(IconData icon, String label, bool active, VoidCallback onTap) {
    final color = active ? AppColors.primary : AppColors.textMuted;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
