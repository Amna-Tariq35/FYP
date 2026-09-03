import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:permission_handler/permission_handler.dart';
import '../cache/beauty_profile_model.dart';
import '../config/app_config.dart';
import '../services/beauty_profile_service.dart';
import '../services/foundation_match_service.dart';
import '../services/web_bridge.dart';
import '../utils/app_colors.dart';
import '../utils/skin_color.dart';
import './beauty_profile_questionnaire_screen.dart';
import './foundation_match_screen.dart';
import './saved_looks_screen.dart';
import 'try_on_screen.dart';
import './settings_screen.dart';
import './privacy_security_screen.dart';
import './edit_profile_screen.dart';
import './favourites_screen.dart';
import './makeup_bag_screen.dart';
import '../cache/favourites_cache.dart';
import '../cache/makeup_bag_cache.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _cameraPermission = false;
  bool _notifications = true;
  bool _isLoading = true;

  String _userName = 'User';
  String _userEmail = '';
  String _avatarUrl = '';
  String _initial = 'U';

  // Beauty Profile
  UserBeautyProfile? _beautyProfile;
  bool _beautyProfileLoading = false;

  /// Last foundation shade match, read from local storage. Shown on the tile so
  /// the user can see their result without a round trip or a second photo.
  CachedFoundationMatch? _foundationMatch;

  @override
  void initState() {
    super.initState();
    _checkPermissions();
    _fetchUserData();
    _loadBeautyProfile();
    _loadFoundationMatch();
  }

  Future<void> _loadFoundationMatch() async {
    final cached = await FoundationMatchService.cachedSummary();
    if (!mounted) return;
    setState(() => _foundationMatch = cached);
  }

  Future<void> _loadBeautyProfile() async {
    if (!mounted) return;
    setState(() => _beautyProfileLoading = true);
    try {
      final profile = await BeautyProfileService.fetchProfile();
      if (mounted) {
        setState(() {
          _beautyProfile = profile;
          BeautyProfileService.setCachedProfile(profile);
        });
      }
    } catch (e) {
      print('[ProfileScreen] Error loading beauty profile: $e');
    } finally {
      if (mounted) setState(() => _beautyProfileLoading = false);
    }
  }

  Future<void> _openBeautyProfileQuestionnaire() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const BeautyProfileQuestionnaireScreen(),
      ),
    );
    if (result is UserBeautyProfile) {
      setState(() => _beautyProfile = result);
    }
  }

  Future<void> _fetchUserData() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user != null) {
        String resolvedName = 'User';
        String resolvedAvatar = '';

        final metadata = user.userMetadata;
        final email = user.email ?? '';

        if (metadata != null && metadata['full_name'] != null) {
          resolvedName = metadata['full_name'];
        } else if (metadata != null && metadata['name'] != null) {
          resolvedName = metadata['name'];
        } else if (email.contains('@')) {
          final namePart = email
              .split('@')[0]
              .replaceAll(RegExp(r'[^a-zA-Z]'), '');
          if (namePart.isNotEmpty) {
            resolvedName =
                namePart[0].toUpperCase() + namePart.substring(1).toLowerCase();
          }
        }

        if (metadata != null && metadata['avatar_url'] != null) {
          resolvedAvatar = metadata['avatar_url'];
        }

        if (mounted) {
          setState(() {
            _userEmail = email.isNotEmpty ? email : 'No email';
            _userName = resolvedName;
            _avatarUrl = resolvedAvatar;
            _initial = _userName.isNotEmpty ? _userName[0].toUpperCase() : 'U';
          });
        }
      }
    } catch (e) {
      debugPrint('ProfileScreen: error fetching user data: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _navigateToTryOn() {
    Navigator.pop(context);
  }

  void _navigateToGallery() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const SavedLooksScreen()),
    );
  }

  Future<void> _openSettings() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const SettingsScreen()),
    );
    // Refresh profile data in case settings affected user state
    await _fetchUserData();
  }

  void _openPrivacySecurity() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const PrivacySecurityScreen()),
    );
  }

  Future<void> _navigateToEditProfile() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const EditProfileScreen()),
    );
    if (result == true) {
      setState(() => _isLoading = true);
      await _fetchUserData();
    }
  }

  Future<void> _checkPermissions() async {
    final status = await Permission.camera.status;
    if (mounted) setState(() => _cameraPermission = status.isGranted);
  }

  Future<void> _toggleCameraPermission(bool value) async {
    if (value) {
      final status = await Permission.camera.request();
      if (mounted) setState(() => _cameraPermission = status.isGranted);
    } else {
      await openAppSettings();
    }
  }

  /// Opens a page on the companion website already signed in as this user.
  /// See [WebBridge] for how the session is handed over.
  Future<void> _openOnWeb(String path) => WebBridge.openAuthenticated(
        context,
        path,
      );

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
        _navigateToTryOn();
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

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
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
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24.0),
                        child: Column(
                          children: [
                            const SizedBox(height: 24),
                            _buildProfileInfo(),
                            const SizedBox(height: 32),
                            _buildBeautyProfileCard(),
                            const SizedBox(height: 32),
                            _buildFoundationMatchShortcut(),
                            const SizedBox(height: 32),
                            _buildFavouritesShortcut(),
                            const SizedBox(height: 32),
                            _buildMakeupBagShortcut(),
                            const SizedBox(height: 32),
                            _buildSavedLooksShortcut(),
                            const SizedBox(height: 32),
                            _buildWebIntegrations(),
                            const SizedBox(height: 32),
                            _buildSettings(),
                            const SizedBox(height: 24),
                            _buildLogoutButton(),
                            const SizedBox(height: 40),
                          ],
                        ),
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
      padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
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
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
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
        // Tapping the entire avatar area goes to edit profile
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
                  backgroundImage: _avatarUrl.isNotEmpty
                      ? NetworkImage(_avatarUrl)
                      : null,
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
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
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
        Text(
          _userEmail,
          style: TextStyle(color: AppColors.textMuted, fontSize: 14),
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
            elevation: 0,
          ),
          child: const Text(
            'Edit Profile',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  Widget _buildSavedLooksShortcut() {
    return GestureDetector(
      onTap: _navigateToGallery,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.secondary.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.image_outlined, color: AppColors.primary),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'My Saved Looks',
                    style: TextStyle(
                      color: AppColors.textMain,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'View your AR try-on gallery',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }


Widget _buildMakeupBagShortcut() {
    return GestureDetector(
      onTap: () async {
        final result = await Navigator.push<String>(
          context,
          MaterialPageRoute(builder: (context) => const MakeupBagScreen()),
        );
        // User tapped "Try On" inside the bag screen — pop profile too so
        // TryOnScreen comes back to foreground, and signal it to enable My Bag.
        if (result == 'tryOnWithMyBag' && context.mounted) {
          Navigator.pop(context, 'tryOnWithMyBag');
        }
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.shopping_bag_rounded, color: AppColors.primary),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'My Makeup Bag',
                    style: TextStyle(
                      color: AppColors.textMain,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Products you actually own',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }

  /// Entry point for the ΔE2000 foundation shade matcher.
  ///
  /// Sits directly under the Beauty Profile card because it is the measured
  /// counterpart to the questionnaire: the quiz asks the user what their
  /// undertone is, this measures it. Once a match exists the tile shows the
  /// result, so the answer is one screen away rather than behind another photo.
  Widget _buildFoundationMatchShortcut() {
    final match = _foundationMatch;
    final hasMatch = match != null;

    return GestureDetector(
      onTap: _openFoundationMatch,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Once a tone is measured the icon *becomes* the measurement.
                // A generic pink square would waste the one place in the app
                // where the user's own colour is worth showing.
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: hasMatch
                        ? Color(0xFF000000 | match.packedSkinColour)
                        : AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: hasMatch
                        ? Border.all(color: AppColors.neutral300)
                        : null,
                  ),
                  child: hasMatch
                      ? null
                      : Icon(Icons.colorize_rounded, color: AppColors.primary),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Find My Foundation Shade',
                        style: TextStyle(
                          color: AppColors.textMain,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        hasMatch
                            ? 'Matched ${match.skinHex.toUpperCase()}'
                            : 'One photo, measured and matched',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: AppColors.textMuted),
              ],
            ),
            if (hasMatch) ...[
              const SizedBox(height: 14),
              Divider(color: AppColors.border, height: 1),
              const SizedBox(height: 12),
              if (match.shadeLabel != null)
                Row(
                  children: [
                    if (match.shadeHex != null)
                      Container(
                        width: 16,
                        height: 16,
                        margin: const EdgeInsets.only(right: 8),
                        decoration: BoxDecoration(
                          color: Color(
                            0xFF000000 |
                                (parseHexColor(match.shadeHex) ?? 0x808080),
                          ),
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.neutral300),
                        ),
                      ),
                    Expanded(
                      child: Text(
                        match.shadeLabel!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: AppColors.textMain,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (match.deltaE != null)
                      Text(
                        'ΔE ${match.deltaE!.toStringAsFixed(1)}',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (match.depthLevel != null && match.depthLevel!.isNotEmpty)
                    _buildProfileChip(_capitalise(match.depthLevel!)),
                  if (match.undertone != null && match.undertone!.isNotEmpty)
                    _buildProfileChip(
                      '${_capitalise(match.undertone!)} undertone',
                    ),
                  if (match.monkScale != null && match.monkScale! > 0)
                    _buildProfileChip('Monk ${match.monkScale}'),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Opens the matcher and relays a "Try in AR" request back to [TryOnScreen].
  ///
  /// The profile screen is itself a route pushed by the try-on screen's *overlay*
  /// navigator, so it cannot apply a shade to the live camera — it has to get out
  /// of the way first. It pops with `tryOn:<productKey>:<shadeKey>`, extending the
  /// same string protocol already used by `tryOnWithMyBag` above.
  Future<void> _openFoundationMatch() async {
    final request = await Navigator.push<FoundationTryOnRequest>(
      context,
      MaterialPageRoute(builder: (context) => const FoundationMatchScreen()),
    );

    if (!mounted) return;

    // The run may have written a new tone into the profile. Refresh both the tile
    // and the beauty profile so the two never disagree on screen.
    _loadFoundationMatch();
    _loadBeautyProfile();

    if (request != null) {
      Navigator.pop(
        context,
        'tryOn:${request.productKey}:${request.shadeKey}',
      );
    }
  }

  static String _capitalise(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  Widget _buildBeautyProfileCard() {    final isEmpty = _beautyProfile == null || _beautyProfile!.isEmpty;

    return GestureDetector(
      onTap: isEmpty ? _openBeautyProfileQuestionnaire : null,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: isEmpty
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.palette_outlined, color: AppColors.primary),
                      const SizedBox(width: 12),
                      Text(
                        'Beauty Profile',
                        style: TextStyle(
                          color: AppColors.textMain,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Complete your beauty profile to get personalized product recommendations.',
                    style: TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _openBeautyProfileQuestionnaire,
                      child: const Text('Take Questionnaire'),
                    ),
                  ),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.palette, color: AppColors.accentPink),
                          const SizedBox(width: 12),
                          Text(
                            'Beauty Profile',
                            style: TextStyle(
                              color: AppColors.textMain,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: _openBeautyProfileQuestionnaire,
                          child: Icon(
                            Icons.edit_outlined,
                            color: AppColors.primary,
                            size: 20,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (_beautyProfile!.skinType != null)
                        _buildProfileChip(_beautyProfile!.skinType!),
                      if (_beautyProfile!.undertone != null)
                        _buildProfileChip(
                          '${_beautyProfile!.undertone![0].toUpperCase()}${_beautyProfile!.undertone!.substring(1)} undertone',
                        ),
                      if (_beautyProfile!.depthLevel != null)
                        _buildProfileChip(_beautyProfile!.depthLevel!),
                      if (_beautyProfile!.concerns != null &&
                          _beautyProfile!.concerns!.isNotEmpty)
                        ..._beautyProfile!.concerns!
                            .take(2)
                            .map((c) => _buildProfileChip(c)),
                      if (_beautyProfile!.concerns != null &&
                          _beautyProfile!.concerns!.length > 2)
                        _buildProfileChip(
                          '+${_beautyProfile!.concerns!.length - 2} more',
                        ),
                    ],
                  ),
                  if (_beautyProfile!.updatedAt != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        'Updated ${_beautyProfile!.updatedAgoText}',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  if (_beautyProfile!.source == 'analysis' ||
                      _beautyProfile!.source == 'both')
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline,
                              color: Colors.blue.shade600, size: 16),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'From your AI Skin Analysis on Web',
                              style: TextStyle(
                                color: Colors.blue.shade600,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
      ),
    );
  }

  Widget _buildProfileChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.accentPink.withOpacity(0.1),
        border: Border.all(color: AppColors.accentPink.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: AppColors.accentPink,
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

Widget _buildFavouritesShortcut() {
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (context) => const FavouritesScreen()),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        margin: const EdgeInsets.only(top: 16), // Spacing between shortcuts
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.03),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.favorite_rounded, color: AppColors.primary),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'My Favourites',
                    style: TextStyle(
                      color: AppColors.textMain,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Products & shades you love',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }

  Widget _buildWebIntegrations() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            'EXPLORE ON WEB',
            style: TextStyle(
              color: AppColors.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
          ),
        ),

        // Skin Analysis card
        GestureDetector(
          onTap: () => _openOnWeb(AppConfig.skinAnalysisPath),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.primary, const Color(0xFFD88A9F)],
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.3),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.auto_awesome,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'AI Skin Analysis',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Get personalized skincare routines',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.open_in_new,
                  color: Colors.white.withValues(alpha: 0.8),
                  size: 16,
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 12),

        // Web Store card
        GestureDetector(
          onTap: () => _openOnWeb(AppConfig.productsPath),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.03),
                  blurRadius: 20,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.shopping_bag_outlined,
                    color: AppColors.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Web Store',
                        style: TextStyle(
                          color: AppColors.textMain,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Shop products & browse saved looks',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.open_in_new, color: AppColors.textMuted, size: 16),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSettings() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            'APP SETTINGS',
            style: TextStyle(
              color: AppColors.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 20,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: [
              _buildSettingTile(
                icon: Icons.camera_alt_outlined,
                title: 'Camera Access',
                subtitle: 'Required for AR Try-On',
                hasToggle: true,
                toggleValue: _cameraPermission,
                onToggle: _toggleCameraPermission,
              ),
              Divider(height: 1, color: AppColors.border),
              _buildSettingTile(
                icon: Icons.notifications_outlined,
                title: 'Notifications',
                subtitle: 'Updates and saved look alerts',
                hasToggle: true,
                toggleValue: _notifications,
                onToggle: (val) => setState(() => _notifications = val),
              ),
              Divider(height: 1, color: AppColors.border),
              _buildSettingTile(
                icon: Icons.shield_outlined,
                title: 'Privacy & Security',
                hasToggle: false,
                onTap: _openPrivacySecurity,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required bool hasToggle,
    bool toggleValue = false,
    ValueChanged<bool>? onToggle,
    VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: hasToggle ? null : onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            Icon(icon, color: AppColors.textMuted, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: AppColors.textMain,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (hasToggle)
              _buildCustomToggle(toggleValue, onToggle!)
            else
              Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildCustomToggle(bool value, ValueChanged<bool> onChanged) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        width: 44,
        height: 24,
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: value ? AppColors.primary : Colors.grey.shade300,
        ),
        alignment: value ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          width: 20,
          height: 20,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.1),
                blurRadius: 2,
                offset: const Offset(0, 1),
              ),
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
          'Sign Out',
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
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildNavItem(
            Icons.camera_alt_outlined,
            'Try-On',
            false,
            _navigateToTryOn,
          ),
          _buildNavItem(
            Icons.image_outlined,
            'Gallery',
            false,
            _navigateToGallery,
          ),
          _buildNavItem(Icons.person_outline, 'Profile', true, () {}),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    IconData icon,
    String label,
    bool isActive,
    VoidCallback onTap,
  ) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(8.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              color: isActive ? AppColors.primary : AppColors.textMuted,
              size: 24,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: isActive ? AppColors.primary : AppColors.textMuted,
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
