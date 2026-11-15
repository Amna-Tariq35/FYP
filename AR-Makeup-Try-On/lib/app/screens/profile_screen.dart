import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../cache/favourites_cache.dart';
import '../cache/makeup_bag_cache.dart';
import '../config/app_config.dart';
import '../services/beauty_profile_service.dart';
import '../services/web_bridge.dart';
import '../utils/app_colors.dart';
import '../utils/image_url.dart';
import '../widgets/app_loader.dart';
import 'auth_screen.dart';
import 'beauty_profile_questionnaire_screen.dart';
import 'edit_profile_screen.dart';
import 'foundation_match_screen.dart';
import 'notifications_inbox_screen.dart';
import 'privacy_security_screen.dart';
import 'settings_screen.dart';

/// Account fields already on the signed-in user. Tests pass this instead of
/// opening a Supabase session.
@visibleForTesting
class ProfilePreview {
  const ProfilePreview({
    this.signedIn = true,
    this.name = 'Alex',
    this.email = 'alex@example.com',
    this.avatarUrl = '',
  });

  const ProfilePreview.signedOut()
      : signedIn = false,
        name = '',
        email = '',
        avatarUrl = '';

  final bool signedIn;
  final String name;
  final String email;
  final String avatarUrl;
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, this.preview});

  @visibleForTesting
  final ProfilePreview? preview;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _isLoading = true;
  bool _profileFetchFailed = false;

  String _userName = 'User';
  String _userEmail = '';
  String _avatarUrl = '';
  String _initial = 'U';

  @override
  void initState() {
    super.initState();
    final preview = widget.preview;
    if (preview != null) {
      _applyPreview(preview);
      _isLoading = false;
      return;
    }
    _fetchUserData();
  }

  void _applyPreview(ProfilePreview preview) {
    _profileFetchFailed = false;
    if (!preview.signedIn) {
      _userName = '';
      _userEmail = '';
      _avatarUrl = '';
      _initial = 'U';
      return;
    }
    _userName = preview.name.trim().isEmpty ? 'User' : preview.name.trim();
    _userEmail = preview.email.trim().isEmpty ? 'No email' : preview.email.trim();
    _avatarUrl = preview.avatarUrl.trim();
    _initial = _userName.isNotEmpty ? _userName[0].toUpperCase() : 'U';
  }

  Future<void> _fetchUserData() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        if (mounted) {
          setState(() {
            _profileFetchFailed = false;
            _userEmail = '';
            _userName = '';
            _isLoading = false;
          });
        }
        return;
      }
      String resolvedName = 'User';
      String resolvedAvatar = '';

      final metadata = user.userMetadata;
      final email = user.email ?? '';

      if (metadata != null && metadata['full_name'] != null) {
        resolvedName = metadata['full_name'].toString();
      } else if (metadata != null && metadata['name'] != null) {
        resolvedName = metadata['name'].toString();
      } else if (email.contains('@')) {
        final namePart = email.split('@')[0].replaceAll(RegExp(r'[^a-zA-Z]'), '');
        if (namePart.isNotEmpty) {
          resolvedName = namePart[0].toUpperCase() + namePart.substring(1).toLowerCase();
        }
      }

      if (metadata != null && metadata['avatar_url'] != null) {
        resolvedAvatar = metadata['avatar_url'].toString();
      }

      if (mounted) {
        setState(() {
          _profileFetchFailed = false;
          _userEmail = email.isNotEmpty ? email : 'No email';
          _userName = resolvedName;
          _avatarUrl = resolvedAvatar;
          _initial = _userName.isNotEmpty ? _userName[0].toUpperCase() : 'U';
        });
      }
    } catch (_) {
      if (mounted) setState(() => _profileFetchFailed = true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  bool get _signedOut {
    final preview = widget.preview;
    if (preview != null) return !preview.signedIn;
    try {
      return Supabase.instance.client.auth.currentUser == null;
    } catch (_) {
      return true;
    }
  }

  void _forwardToCamera(Object? result) {
    if (!mounted || result == null) return;
    final backToCamera = result is List ||
        result is FoundationTryOnRequest ||
        result is FoundationLookRequest ||
        result == 'tryOnWithMyBag' ||
        (result is String && result.startsWith('tryOn:'));
    if (backToCamera) Navigator.pop(context, result);
  }

  Future<void> _openPage(Widget page) async {
    final result = await Navigator.push<Object?>(
      context,
      MaterialPageRoute(builder: (_) => page),
    );
    if (!mounted) return;
    _forwardToCamera(result);
  }

  Future<void> _openSignedInPage(Widget page) async {
    if (_signedOut) {
      await _openSignIn();
      return;
    }
    await _openPage(page);
  }

  Future<void> _openSignIn() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => const AuthScreen(isLoginMode: true)),
    );
  }

  Future<void> _openOrders() async {
    if (_signedOut) {
      await _openSignIn();
      return;
    }
    if (!mounted) return;
    await WebBridge.openAuthenticated(context, AppConfig.myOrdersPath);
  }

  Future<void> _openSettings() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );
    if (widget.preview != null) return;
    await _fetchUserData();
  }

  void _openPrivacySecurity() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const PrivacySecurityScreen()),
    );
  }

  Future<void> _openHelp() =>
      WebBridge.openPublic(context, AppConfig.supportPath);

  void _showAbout() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          'AR Makeup',
          style: TextStyle(color: AppColors.textMain),
        ),
        content: Text(
          'Live makeup try-on, foundation shade match, saved looks, and the shop on the website.',
          style: TextStyle(color: AppColors.textMuted, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(
              'Close',
              style: TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _navigateToEditProfile() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const EditProfileScreen()),
    );
    if (result == true && widget.preview == null) {
      setState(() => _isLoading = true);
      await _fetchUserData();
    }
  }

  Future<void> _confirmSignOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          'Sign out?',
          style: TextStyle(color: AppColors.textMain),
        ),
        content: Text(
          'You can sign in again on this phone whenever you want.',
          style: TextStyle(color: AppColors.textMuted, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              'Sign out',
              style: TextStyle(
                color: AppColors.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
    if (confirmed == true) await _handleLogout();
  }

  Future<void> _handleLogout() async {
    try {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(child: AppLoader()),
      );

      await Supabase.instance.client.auth.signOut();
      FavouritesCache.instance.clear();
      MakeupBagCache.instance.clear();
      BeautyProfileService.clearCache();

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Signed out successfully'),
            backgroundColor: AppColors.primary,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    } catch (_) {
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Sign out failed. Please try again.'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    AppColors.watch(context);
    final signedOut = _signedOut;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: _isLoading
            ? const AppLoader.centered()
            : SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Semantics(
                        button: true,
                        label: 'Back',
                        child: IconButton(
                          onPressed: () => Navigator.maybePop(context),
                          icon: Icon(Icons.chevron_left, color: AppColors.textMain),
                          iconSize: 28,
                          constraints: const BoxConstraints(
                            minWidth: 48,
                            minHeight: 48,
                          ),
                        ),
                      ),
                    ),
                    if (signedOut)
                      _SignedOutCard(onSignIn: _openSignIn)
                    else
                      _HeaderCard(
                        name: _userName,
                        email: _userEmail,
                        avatarUrl: _avatarUrl,
                        initial: _initial,
                        failed: _profileFetchFailed,
                        onRetry: _fetchUserData,
                        onEdit: _navigateToEditProfile,
                      ),
                    const SizedBox(height: 20),
                    if (!signedOut) ...[
                      const _GroupLabel('My beauty'),
                      _GroupCard(
                        tiles: [
                          _ProfileTile(
                            icon: Icons.face_retouching_natural_outlined,
                            title: 'Beauty profile',
                            subtitle: 'Skin type and preferences',
                            onTap: () => _openSignedInPage(
                              const BeautyProfileQuestionnaireScreen(),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      const _GroupLabel('Orders and updates'),
                      _GroupCard(
                        tiles: [
                          _ProfileTile(
                            icon: Icons.receipt_long_outlined,
                            title: 'My orders',
                            subtitle: 'Track on the website',
                            onTap: _openOrders,
                          ),
                          _ProfileTile(
                            icon: Icons.notifications_none_rounded,
                            title: 'Notifications',
                            subtitle: 'Alerts on this phone',
                            onTap: () => _openSignedInPage(
                              const NotificationsInboxScreen(),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                    ],
                    const _GroupLabel('App'),
                    _GroupCard(
                      tiles: [
                        _ProfileTile(
                          icon: Icons.settings_outlined,
                          title: 'Settings',
                          subtitle: 'Theme and camera',
                          onTap: _openSettings,
                        ),
                        _ProfileTile(
                          icon: Icons.shield_outlined,
                          title: 'Privacy and security',
                          subtitle: 'Password and data',
                          onTap: _openPrivacySecurity,
                        ),
                        _ProfileTile(
                          icon: Icons.help_outline,
                          title: 'Help',
                          subtitle: 'Support on the website',
                          onTap: _openHelp,
                        ),
                        _ProfileTile(
                          icon: Icons.info_outline,
                          title: 'About',
                          subtitle: 'What this app does',
                          onTap: _showAbout,
                        ),
                      ],
                    ),
                    if (!signedOut) ...[
                      const SizedBox(height: 20),
                      Semantics(
                        button: true,
                        label: 'Sign out',
                        child: OutlinedButton.icon(
                          onPressed: _confirmSignOut,
                          icon: Icon(Icons.logout, size: 18, color: AppColors.error),
                          label: Text(
                            'Sign out',
                            style: TextStyle(
                              color: AppColors.error,
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.error,
                            minimumSize: const Size.fromHeight(48),
                            side: BorderSide(color: AppColors.error),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    Text(
                      'AR Makeup',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _SignedOutCard extends StatelessWidget {
  const _SignedOutCard({required this.onSignIn});

  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: _cardDecoration(),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Your profile lives here',
              style: TextStyle(
                color: AppColors.textMain,
                fontSize: 20,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Sign in to see your name, looks, and orders.',
              style: TextStyle(
                color: AppColors.textMuted,
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            Semantics(
              button: true,
              label: 'Sign in',
              child: ElevatedButton(
                onPressed: onSignIn,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(48),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Sign in',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({
    required this.name,
    required this.email,
    required this.avatarUrl,
    required this.initial,
    required this.failed,
    required this.onRetry,
    required this.onEdit,
  });

  final String name;
  final String email;
  final String avatarUrl;
  final String initial;
  final bool failed;
  final VoidCallback onRetry;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final cacheWidth =
        (72 * MediaQuery.devicePixelRatioOf(context)).round().clamp(72, 288);
    final photo = avatarUrl.trim().isEmpty ? null : upgradeImageUrl(avatarUrl);
    return DecoratedBox(
      decoration: _cardDecoration(),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            photo == null
                ? _Initials(initial: initial, size: 72)
                : ClipOval(
                    child: CachedNetworkImage(
                      imageUrl: photo,
                      width: 72,
                      height: 72,
                      fit: BoxFit.cover,
                      memCacheWidth: cacheWidth,
                      fadeInDuration: Duration.zero,
                      errorWidget: (_, _, _) =>
                          _Initials(initial: initial, size: 72),
                    ),
                  ),
            const SizedBox(height: 12),
            Text(
              name,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.textMain,
                fontSize: 22,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 4),
            if (failed)
              Text(
                'Could not load your profile.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textMuted, fontSize: 14),
              )
            else
              Text(
                email,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 14,
                  height: 1.3,
                ),
              ),
            if (failed)
              TextButton(
                onPressed: onRetry,
                style: TextButton.styleFrom(
                  minimumSize: const Size(48, 48),
                  foregroundColor: AppColors.primary,
                ),
                child: const Text(
                  'Retry',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            const SizedBox(height: 8),
            Semantics(
              button: true,
              label: 'Edit profile',
              child: OutlinedButton(
                onPressed: onEdit,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.accentPink,
                  minimumSize: const Size.fromHeight(48),
                  side: BorderSide(color: AppColors.accentPink),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Edit profile',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.initial, required this.size});

  final String initial;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.primary,
      ),
      child: Text(
        initial,
        style: TextStyle(
          color: Colors.white,
          fontSize: size * 0.38,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        text,
        style: TextStyle(
          color: AppColors.textMuted,
          fontSize: 13,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.tiles});

  final List<_ProfileTile> tiles;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 0,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: _cardDecoration(),
        child: Column(
          children: [
            for (var i = 0; i < tiles.length; i++) ...[
              if (i > 0) Divider(height: 1, thickness: 1, color: AppColors.border),
              tiles[i],
            ],
          ],
        ),
      ),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: title,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: AppColors.accentPink, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          color: AppColors.textMain,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          height: 1.2,
                        ),
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 12,
                            height: 1.3,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

BoxDecoration _cardDecoration() {
  return BoxDecoration(
    color: AppColors.surface,
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: AppColors.border),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withValues(alpha: AppColors.isDark ? 0.28 : 0.05),
        blurRadius: 2,
        offset: const Offset(0, 1),
      ),
    ],
  );
}
