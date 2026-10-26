import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/beauty_profile_service.dart';
import '../utils/app_colors.dart';
import '../cache/favourites_cache.dart';
import '../cache/makeup_bag_cache.dart';
import 'edit_profile_screen.dart';
import 'home_screen.dart';
import 'privacy_security_screen.dart';
import 'settings_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, this.openedOverHome = false});

  /// True when Home pushed this screen, so Home in the bar goes back.
  final bool openedOverHome;

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
    _fetchUserData();
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

  void _backToCamera() {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<void> _openHome() async {
    if (widget.openedOverHome) {
      Navigator.pop(context);
      return;
    }
    final result = await Navigator.push<Object?>(
      context,
      MaterialPageRoute(builder: (_) => const HomeScreen()),
    );
    if (!mounted || result == null) return;
    Navigator.pop(context, result);
  }

  Future<void> _openSettings() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );
    await _fetchUserData();
  }

  void _openPrivacySecurity() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const PrivacySecurityScreen()),
    );
  }

  Future<void> _navigateToEditProfile() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const EditProfileScreen()),
    );
    if (result == true) {
      setState(() => _isLoading = true);
      await _fetchUserData();
    }
  }

  Future<void> _handleLogout() async {
    try {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) =>
            Center(child: CircularProgressIndicator(color: AppColors.primary)),
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
        _backToCamera();
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Sign out failed. Please try again.'),
            backgroundColor: Colors.red,
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
    final signedOut = Supabase.instance.client.auth.currentUser == null;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: _isLoading
            ? Center(child: CircularProgressIndicator(color: AppColors.primary))
            : Column(
                children: [
                  _buildHeader(),
                  Expanded(
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        children: [
                          const SizedBox(height: 24),
                          if (signedOut)
                            Text(
                              'Sign in to see your account.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: AppColors.textMuted,
                                fontSize: 15,
                                height: 1.4,
                              ),
                            )
                          else ...[
                            _buildProfileInfo(),
                            const SizedBox(height: 28),
                            _buildPrivacyTile(),
                            const SizedBox(height: 16),
                            _buildLogoutButton(),
                          ],
                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ),
                  _buildBottomNav(),
                ],
              ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildIconButton(Icons.chevron_left, () => Navigator.pop(context)),
          Text(
            'Profile',
            style: TextStyle(
              color: AppColors.textMain,
              fontSize: 18,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.5,
            ),
          ),
          _buildIconButton(Icons.settings_outlined, _openSettings),
        ],
      ),
    );
  }

  Widget _buildIconButton(IconData icon, VoidCallback onTap) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.surface,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.border),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Icon(icon, color: AppColors.textMain, size: 20),
        ),
      ),
    );
  }

  Widget _buildProfileInfo() {
    return Column(
      children: [
        GestureDetector(
          onTap: _navigateToEditProfile,
          child: Stack(
            alignment: Alignment.bottomRight,
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [AppColors.primary, AppColors.secondary],
                  ),
                ),
                child: CircleAvatar(
                  radius: 44,
                  backgroundColor: AppColors.surface,
                  backgroundImage:
                      _avatarUrl.isNotEmpty ? NetworkImage(_avatarUrl) : null,
                  child: _avatarUrl.isEmpty
                      ? Text(
                          _initial,
                          style: TextStyle(
                            color: AppColors.primary,
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                          ),
                        )
                      : null,
                ),
              ),
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.border),
                ),
                child: Icon(
                  Icons.camera_alt_outlined,
                  color: AppColors.primary,
                  size: 16,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          _userName,
          style: TextStyle(
            color: AppColors.textMain,
            fontSize: 24,
            fontWeight: FontWeight.bold,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 4),
        if (_profileFetchFailed)
          Text(
            'Could not load your profile.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted, fontSize: 14),
          )
        else
          Text(
            _userEmail,
            style: TextStyle(color: AppColors.textMuted, fontSize: 14),
          ),
        if (_profileFetchFailed)
          TextButton(
            onPressed: _fetchUserData,
            child: Text(
              'Retry',
              style: TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        const SizedBox(height: 20),
        OutlinedButton(
          onPressed: _navigateToEditProfile,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.primary,
            side: BorderSide(color: AppColors.primary.withValues(alpha: 0.3)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(30),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            backgroundColor: AppColors.surface,
          ),
          child: const Text(
            'Edit profile',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  Widget _buildPrivacyTile() {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: _openPrivacySecurity,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(Icons.shield_outlined, color: AppColors.textMuted, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Privacy and security',
                  style: TextStyle(
                    color: AppColors.textMain,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLogoutButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: _handleLogout,
        icon: Icon(Icons.logout, size: 18, color: AppColors.primary),
        label: Text(
          'Sign out',
          style: TextStyle(
            color: AppColors.primary,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.primary,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: AppColors.border),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomNav() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _navItem(Icons.camera_alt_outlined, 'Try-On', false, _backToCamera),
          _navItem(Icons.home_outlined, 'Home', false, _openHome),
          _navItem(Icons.person_outline, 'Profile', true, () {}),
        ],
      ),
    );
  }

  Widget _navItem(IconData icon, String label, bool active, VoidCallback onTap) {
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
