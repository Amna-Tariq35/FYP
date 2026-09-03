import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../utils/app_colors.dart';
import 'camera_permission_screen.dart';
import 'dart:async';
import '../cache/looks_cache.dart';
import '../screens/try_on_screen.dart'; // Apna sahi path check kar lein
import 'package:permission_handler/permission_handler.dart';
import '../cache/favourites_cache.dart';
import '../cache/makeup_bag_cache.dart';

class AuthScreen extends StatefulWidget {
  final bool isLoginMode;
  const AuthScreen({super.key, this.isLoginMode = true});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen>
    with SingleTickerProviderStateMixin {
  late bool isSignIn;
  bool isLoading = false;
  bool isGoogleLoading = false;
  bool _obscurePassword = true;

  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  StreamSubscription<AuthState>? _authStateSubscription;

  late final AnimationController _animController;
  late final Animation<double> _fadeAnim;
  late final Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    isSignIn = widget.isLoginMode;

    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _fadeAnim = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _animController, curve: Curves.easeOut));
    _animController.forward();

    _setupAuthListener();
  }

 void _setupAuthListener() {
   _authStateSubscription = Supabase.instance.client.auth.onAuthStateChange
      .listen((data) async {
        if (data.event == AuthChangeEvent.signedIn && mounted) {
          final userId = data.session?.user.id;
          if (userId != null) {
            LooksCache.instance.prefetch(userId);
            FavouritesCache.instance.prefetch(userId);
            FavouritesCache.instance.listenRealtime(userId);
            MakeupBagCache.instance.prefetch(userId);
            MakeupBagCache.instance.listenRealtime(userId);
          }
          if (!mounted) return;

          // 🆕 FIX (real root cause of the DeepAR "disconnected/abandoned
          // window" / EGL_BAD_NATIVE_WINDOW crash loop after sign-in):
          //
          // AuthScreen can be reached two ways:
          //   1) Pushed as an OVERLAY on top of an already-running
          //      TryOnScreen (its "Sign in to save/favourite/..." prompts
          //      push AuthScreen onto a nested overlay Navigator that sits
          //      inside TryOnScreen's own widget tree).
          //   2) As the app's own entry/root screen, with no TryOnScreen
          //      underneath at all.
          //
          // The old code always did `Navigator.pushReplacement(...,
          // TryOnScreen())` here. In case (1), `context` resolves to that
          // NESTED overlay Navigator, so pushReplacement created a BRAND
          // NEW TryOnScreen (a second DeepAR SurfaceView / camera session)
          // stacked on top of the ORIGINAL TryOnScreen, which was still
          // alive underneath. Two SurfaceViews fighting over the same
          // camera hardware / GL context is exactly what produced the
          // "abandoned window" errors — no amount of fixing TryOnScreen's
          // own navigation could prevent that, since the duplicate
          // instance was being created here.
          //
          // Fix: if we can pop (case 1), just pop — that reveals the
          // original, still-running TryOnScreen with zero re-init and no
          // duplicate SurfaceView. Only fall back to creating a
          // TryOnScreen/CameraPermissionScreen when there is nothing to
          // pop back to (case 2).
          final navigator = Navigator.of(context);
          if (navigator.canPop()) {
            navigator.pop();
            return;
          }

          if (mounted) setState(() => isLoading = true);

          final cameraStatus = await Permission.camera.status;
          if (!mounted) return;

          // 🆕 CRITICAL FIX: Zero duration ki jagah normal transition do
          // Zero duration mein Android surface attach hone ka waqt nahi milta
          Navigator.pushReplacement(
            context,
            PageRouteBuilder(
              pageBuilder: (_, __, ___) => cameraStatus.isGranted
                  ? const TryOnScreen()
                  : const CameraPermissionScreen(),
              // 🆕 300ms transition — surface ko settle hone ka waqt milta hai
              transitionDuration: const Duration(milliseconds: 300),
              reverseTransitionDuration: const Duration(milliseconds: 300),
              transitionsBuilder: (_, animation, __, child) {
                return FadeTransition(opacity: animation, child: child);
              },
            ),
          );
        }
      });
}
  @override
  void dispose() {
    _authStateSubscription?.cancel();
    _animController.dispose();
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(email.trim());
  }

  Future<void> handleAuth() async {
    final email = emailController.text.trim();
    final password = passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      _showSnackBar('Please fill in all fields.');
      return;
    }
    if (!_isValidEmail(email)) {
      _showSnackBar('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      _showSnackBar('Password must be at least 6 characters.');
      return;
    }

    setState(() => isLoading = true);
    try {
      if (isSignIn) {
        await Supabase.instance.client.auth.signInWithPassword(
          email: email,
          password: password,
        );
        // Navigation is handled by the auth state listener above.
      } else {
        await Supabase.instance.client.auth.signUp(
          email: email,
          password: password,
        );
        // After signup, the user must verify their email before signing in.
        // Do NOT navigate here — show a confirmation message instead.
        if (mounted) {
          _showSnackBar(
            'Account created! Please check your email for a confirmation link.',
            color: const Color(0xFF22C55E),
            duration: const Duration(seconds: 5),
          );
          setState(() => isSignIn = true);
        }
      }
    } on AuthException catch (error) {
      _showSnackBar(error.message, color: Colors.red.shade400);
    } catch (_) {
      _showSnackBar('An unexpected error occurred. Please try again.');
    } finally {
      if (mounted) setState(() => isLoading = false);
    }
  }

  Future<void> signInWithGoogle() async {
  // ── Turant full screen loader dikhao ──────────────────────────────────
  setState(() => isGoogleLoading = true);
  
  try {
    await Supabase.instance.client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: 'io.supabase.flutter://login-callback/',
    );
    // OAuth browser mein khulta hai — app background jaati hai
    // Wapas aane pe AppRoot handle karega
    // isGoogleLoading = true REHNE DO — screen covered rahegi
  } on AuthException catch (error) {
    // Sirf error pe loading hatao
    if (mounted) setState(() => isGoogleLoading = false);
    _showSnackBar(error.message, color: Colors.red.shade400);
  } catch (_) {
    if (mounted) setState(() => isGoogleLoading = false);
    _showSnackBar('Google Sign-In failed. Please try again.');
  }
  // ── finally mat likho — loading state rehni chahiye ──────────────────
}

  void _showSnackBar(
    String message, {
    Color? color,
    Duration duration = const Duration(seconds: 3),
  }) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: color ?? AppColors.textMuted,
        duration: duration,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  void _switchMode() {
    setState(() {
      isSignIn = !isSignIn;
      emailController.clear();
      passwordController.clear();
    });
    _animController
      ..reset()
      ..forward();
  }

  @override
  Widget build(BuildContext context) {
   return Scaffold(
    backgroundColor: AppColors.background,
    appBar: isGoogleLoading ? null : AppBar(  // loading mein appbar bhi hatao
      backgroundColor: Colors.transparent,
      elevation: 0,
      iconTheme: IconThemeData(color: AppColors.textMain),
    ),
    body: isGoogleLoading
        // ── Full screen loader — koi flash nahi ──────────────────────
        ? _buildGoogleLoadingScreen()
        // ── Normal auth form ─────────────────────────────────────────
        :  SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
            child: FadeTransition(
              opacity: _fadeAnim,
              child: SlideTransition(
                position: _slideAnim,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Header ──────────────────────────────────────────────
                    _buildHeader(),
                    const SizedBox(height: 36),

                    // ── Form card ────────────────────────────────────────────
                    _buildFormCard(),

                    const SizedBox(height: 28),

                    // ── Mode toggle ──────────────────────────────────────────
                    _buildModeToggle(),

                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Decorative accent
        Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          isSignIn ? 'Welcome\nBack' : 'Create\nAccount',
          style: TextStyle(
            fontSize: 36,
            fontWeight: FontWeight.w800,
            color: AppColors.textMain,
            height: 1.15,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          isSignIn
              ? 'Sign in to access your saved AR looks.'
              : 'Join us to save your favorite AR makeup looks.',
          style: TextStyle(
            fontSize: 15,
            color: AppColors.textMuted,
            height: 1.55,
          ),
        ),
      ],
    );
  }

  Widget _buildFormCard() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF000000).withAlpha(8),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
          BoxShadow(
            color: AppColors.primary.withAlpha(10),
            blurRadius: 40,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Email
          _buildFieldLabel('Email'),
          const SizedBox(height: 8),
          _buildTextField(
            controller: emailController,
            hint: 'you@example.com',
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.mail_outline_rounded,
          ),
          const SizedBox(height: 20),

          // Password
          _buildFieldLabel('Password'),
          const SizedBox(height: 8),
          _buildTextField(
            controller: passwordController,
            hint: '••••••••',
            obscureText: _obscurePassword,
            prefixIcon: Icons.lock_outline_rounded,
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                color: AppColors.textMuted,
                size: 20,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
          ),
          const SizedBox(height: 28),

          // Primary CTA
          _buildPrimaryButton(),

          const SizedBox(height: 20),

          // Divider
          Row(
            children: [
              Expanded(child: Divider(color: AppColors.border, thickness: 1)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Text(
                  'OR',
                  style: TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.08,
                  ),
                ),
              ),
              Expanded(child: Divider(color: AppColors.border, thickness: 1)),
            ],
          ),

          const SizedBox(height: 20),

          // Google button
          _buildGoogleButton(),
        ],
      ),
    );
  }

  Widget _buildFieldLabel(String label) {
    return Text(
      label,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.textMain,
        letterSpacing: 0.02,
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    TextInputType keyboardType = TextInputType.text,
    bool obscureText = false,
    required IconData prefixIcon,
    Widget? suffixIcon,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      style: TextStyle(color: AppColors.textMain, fontSize: 15),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.textMuted, fontSize: 14),
        prefixIcon: Icon(prefixIcon, color: AppColors.textMuted, size: 20),
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: AppColors.background,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
    );
  }

  Widget _buildPrimaryButton() {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton(
        onPressed: isLoading ? null : handleAuth,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          disabledBackgroundColor: AppColors.primary.withAlpha(120),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2.5,
                ),
              )
            : Text(
                isSignIn ? 'Sign In' : 'Create Account',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: 0.02,
                ),
              ),
      ),
    );
  }

  Widget _buildGoogleButton() {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: OutlinedButton(
        onPressed: isGoogleLoading ? null : signInWithGoogle,
        style: OutlinedButton.styleFrom(
          backgroundColor: AppColors.surface,
          side: BorderSide(color: AppColors.border, width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: isGoogleLoading
            ? SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  color: AppColors.primary,
                  strokeWidth: 2.5,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Image.network(
                    'https://img.icons8.com/color/48/000000/google-logo.png',
                    width: 22,
                    height: 22,
                    errorBuilder: (_, __, ___) => Icon(
                      Icons.g_mobiledata_rounded,
                      color: AppColors.textMuted,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Continue with Google',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textMain,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildModeToggle() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          isSignIn ? "Don't have an account? " : "Already have an account? ",
          style: TextStyle(color: AppColors.textMuted, fontSize: 14),
        ),
        GestureDetector(
          onTap: _switchMode,
          child: Text(
            isSignIn ? 'Sign Up' : 'Sign In',
            style: TextStyle(
              color: AppColors.primary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}
Widget _buildGoogleLoadingScreen() {
  return Container(
    color: AppColors.background,
    child: Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.primary.withValues(alpha: 0.10),
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.20),
                width: 1.5,
              ),
            ),
            child: Icon(
              Icons.face_retouching_natural_rounded,
              color: AppColors.primary,
              size: 32,
            ),
          ),
          const SizedBox(height: 20),
          CircularProgressIndicator(
            color: AppColors.primary,
            strokeWidth: 1.5,
          ),
          const SizedBox(height: 16),
          Text(
            'Signing you in…',
            style: TextStyle(
              color: AppColors.textMuted,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    ),
  );
}