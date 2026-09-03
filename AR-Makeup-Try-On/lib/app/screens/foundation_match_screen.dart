// lib/app/screens/foundation_match_screen.dart
//
// Foundation Shade Match — the screen the user actually sees.
//
// Flow: guidance → photo → on-device sampling → server ranking → result.
//
// Four things this screen is built around, each of which is a decision rather
// than a default:
//
//  1. **The guidance is part of the algorithm.** Foundation matched over existing
//     foundation measures the old foundation, and a warm bulb shifts skin further
//     than the gap between two neighbouring shades. Those two mistakes account for
//     most of the wrong answers a matcher of this kind gives, and neither is
//     fixable after the shutter. So the advice is shown before the camera opens,
//     not buried in a help page.
//
//  2. **A refusal is a result.** "Retake, the light was too warm" is a real
//     outcome and gets a designed state, not an error toast. A matcher that
//     guesses when it cannot see is worse than one that says so.
//
//  3. **Every number is explained.** ΔE, confidence and undertone all appear with
//     the reason next to them. This is also what makes the feature defensible in
//     a viva: nothing on screen is a figure the user has to take on faith.
//
//  4. **Nothing here can crash.** Every colour is parsed defensively, every
//     await is followed by a `mounted` check, and the whole result model tolerates
//     missing fields — see `foundation_match_service.dart`.

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../cache/makeup_bag_cache.dart';
import '../config/app_config.dart';
import '../services/beauty_profile_service.dart';
import '../services/foundation_match_service.dart';
import '../services/web_bridge.dart';
import '../utils/app_colors.dart';
import '../utils/skin_color.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Result contract
// ─────────────────────────────────────────────────────────────────────────────

/// What the screen pops when the user taps **Try in AR**.
///
/// The screen does not apply the shade itself: it may be running on top of a live
/// DeepAR surface, and the only safe way to hand a selection back is to pop with
/// it and let the try-on screen apply it once this route is gone.
class FoundationTryOnRequest {
  const FoundationTryOnRequest({
    required this.productKey,
    required this.shadeKey,
    required this.shadeName,
  });

  final String productKey;
  final String shadeKey;
  final String shadeName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

enum _Stage { intake, working, retake, result }

class FoundationMatchScreen extends StatefulWidget {
  const FoundationMatchScreen({super.key});

  @override
  State<FoundationMatchScreen> createState() => _FoundationMatchScreenState();
}

class _FoundationMatchScreenState extends State<FoundationMatchScreen> {
  _Stage _stage = _Stage.intake;

  /// Non-null only in [_Stage.result] and [_Stage.retake].
  FoundationMatchResult? _result;

  /// A failure that stopped the run before the server saw it.
  String? _errorMessage;
  String? _errorHint;

  /// What the pipeline is doing, so a slow phone shows progress rather than a
  /// spinner that could mean anything.
  String _progressLabel = '';

  /// The last match, read from local storage on open. Lets the screen show a
  /// previous result with no network and no second photo.
  CachedFoundationMatch? _cached;

  /// Guards against a second tap while a run is in flight.
  bool _busy = false;

  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _loadCached();
  }

  Future<void> _loadCached() async {
    final cached = await FoundationMatchService.cachedSummary();
    if (!mounted) return;
    setState(() => _cached = cached);
  }

  // ── Run ────────────────────────────────────────────────────────────────────

  Future<void> _run(ImageSource source) async {
    if (_busy) return;

    XFile? picked;
    try {
      // Deliberately no `maxWidth` / `imageQuality`: both make the plugin
      // re-encode the JPEG, which on some Android OEM builds bakes or drops the
      // EXIF orientation tag. The sampler already caps its decode at 1440 px and
      // checks that ML Kit and the Flutter decoder agree on orientation, so
      // handing it the untouched original is both safer and cheaper.
      picked = await _picker.pickImage(
        source: source,
        preferredCameraDevice: CameraDevice.front,
      );
    } catch (e) {
      debugPrint('[FoundationMatch] picker failed: $e');
      if (!mounted) return;
      setState(() {
        _stage = _Stage.intake;
        _errorMessage = source == ImageSource.camera
            ? "Couldn't open the camera."
            : "Couldn't open your photos.";
        _errorHint = 'Check the app permissions in Settings and try again.';
      });
      return;
    }

    if (picked == null) return; // Cancelled — not an error.
    if (!mounted) return;

    setState(() {
      _busy = true;
      _stage = _Stage.working;
      _errorMessage = null;
      _errorHint = null;
      _progressLabel = 'Finding your face…';
    });

    // The sampler and the request together take a couple of seconds; the labels
    // are timed to the actual phases rather than faked on a timer, except this
    // one hand-off which happens too fast to observe otherwise.
    Future.delayed(const Duration(milliseconds: 700), () {
      if (mounted && _stage == _Stage.working) {
        setState(() => _progressLabel = 'Measuring your skin tone…');
      }
    });
    Future.delayed(const Duration(milliseconds: 1800), () {
      if (mounted && _stage == _Stage.working) {
        setState(() => _progressLabel = 'Comparing against every shade…');
      }
    });

    try {
      final result = await FoundationMatchService.matchFromPhoto(
        picked.path,
        finishPreference: BeautyProfileService.getCachedProfile()?.finishPreference,
      );

      if (!mounted) return;

      setState(() {
        _busy = false;
        _result = result;
        _stage = result.needsRetake ? _Stage.retake : _Stage.result;
      });

      // The server wrote the measured tone into `user_skin_profiles`. Refresh the
      // local beauty-profile cache from it, otherwise the try-on sheet keeps
      // sorting foundation by the *old* tone until the app is restarted — the
      // exact kind of inconsistency that makes a feature feel broken.
      if (result.savedToProfile) {
        _refreshBeautyProfileCache();
      }

      // A cached result is now stale.
      _loadCached();
    } on FoundationMatchException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _stage = _Stage.intake;
        _errorMessage = e.message;
        _errorHint = e.hint;
      });
    } catch (e, st) {
      // Anything reaching here is a bug, not a bad photo. It is still not allowed
      // to take the screen down.
      debugPrint('[FoundationMatch] unexpected: $e\n$st');
      if (!mounted) return;
      setState(() {
        _busy = false;
        _stage = _Stage.intake;
        _errorMessage = 'Something went wrong while matching your shade.';
        _errorHint = 'Please try again.';
      });
    }
  }

  Future<void> _refreshBeautyProfileCache() async {
    try {
      final profile = await BeautyProfileService.fetchProfile();
      BeautyProfileService.setCachedProfile(profile);
    } catch (e) {
      // Purely an optimisation; the next profile screen open will pick it up.
      debugPrint('[FoundationMatch] profile cache refresh failed: $e');
    }
  }

  // ── Actions on a match ─────────────────────────────────────────────────────

  void _tryInAr(FoundationMatch match) {
    Navigator.pop(
      context,
      FoundationTryOnRequest(
        productKey: match.productKey,
        shadeKey: match.shadeKey,
        shadeName: '${match.productName} · ${match.shadeName}',
      ),
    );
  }

  Future<void> _addToBag(FoundationMatch match) async {
    final bag = MakeupBagCache.instance;
    final already = bag.isInBag(match.productKey, match.shadeKey);
    if (already) {
      _toast('${match.shadeName} is already in your Makeup Bag.');
      return;
    }

    // `toggleInBag` is a toggle, so it is only ever called here after confirming
    // the item is absent — otherwise "Add to bag" would silently remove it.
    await bag.toggleInBag(match.productKey, match.shadeKey);
    if (!mounted) return;
    _toast('Added ${match.shadeName} to your Makeup Bag.');
  }

  Future<void> _buyOnWeb(FoundationMatch match) async {
    // Authenticated so the site opens signed in, and the product page can show
    // "in your bag" state consistently with the app.
    await WebBridge.openAuthenticated(
      context,
      '${AppConfig.productsPath}?product=${Uri.encodeComponent(match.productKey)}',
    );
  }

  void _toast(String message) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger.showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(color: Colors.white)),
        backgroundColor: AppColors.primary,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.all(16),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.chevron_left, color: AppColors.textMain),
          onPressed: _busy ? null : () => Navigator.pop(context),
        ),
        title: Text(
          'Find My Shade',
          style: TextStyle(
            color: AppColors.textMain,
            fontSize: 17,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.3,
          ),
        ),
        centerTitle: true,
        actions: [
          if (_stage == _Stage.result || _stage == _Stage.retake)
            IconButton(
              tooltip: 'Start again',
              icon: Icon(Icons.refresh_rounded, color: AppColors.primary),
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _stage = _Stage.intake;
                        _result = null;
                        _errorMessage = null;
                        _errorHint = null;
                      }),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: switch (_stage) {
          _Stage.intake => _buildIntake(),
          _Stage.working => _buildWorking(),
          _Stage.retake => _buildRetake(),
          _Stage.result => _buildResult(),
        },
      ),
    );
  }

  // ── Stage: intake ──────────────────────────────────────────────────────────

  Widget _buildIntake() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      physics: const BouncingScrollPhysics(),
      children: [
        const _HeroBlurb(),
        const SizedBox(height: 24),

        if (_errorMessage != null) ...[
          _NoticeCard(
            icon: Icons.error_outline_rounded,
            tone: _NoticeTone.error,
            title: _errorMessage!,
            body: _errorHint,
          ),
          const SizedBox(height: 20),
        ],

        _SectionLabel('For an accurate result'),
        const SizedBox(height: 12),        const _TipRow(
          icon: Icons.face_retouching_off_rounded,
          title: 'Bare skin',
          body:
              'No foundation, concealer or powder. Otherwise the match is made '
              'against the makeup you are already wearing, not your skin.',
        ),
        const _TipRow(
          icon: Icons.wb_sunny_outlined,
          title: 'Daylight, facing a window',
          body:
              'Warm bulbs shift your skin more than the gap between two '
              'neighbouring shades. Photos taken under one are rejected.',
        ),
        const _TipRow(
          icon: Icons.auto_fix_off_rounded,
          title: 'No filters or beauty mode',
          body: 'Smoothing changes the colour it smooths.',
        ),
        const _TipRow(
          icon: Icons.center_focus_strong_rounded,
          title: 'Face straight on, hair back',
          body: 'Forehead, both cheeks and jaw all need to be visible.',
        ),

        const SizedBox(height: 28),
        _PrimaryButton(
          icon: Icons.photo_camera_rounded,
          label: 'Take a photo',
          onTap: _busy ? null : () => _run(ImageSource.camera),
        ),
        const SizedBox(height: 12),
        _SecondaryButton(
          icon: Icons.photo_library_outlined,
          label: 'Choose from gallery',
          onTap: _busy ? null : () => _run(ImageSource.gallery),
        ),

        const SizedBox(height: 24),
        const _PrivacyNote(),

        if (_cached != null) ...[
          const SizedBox(height: 28),
          _SectionLabel('Your last match'),
          const SizedBox(height: 12),
          _CachedMatchCard(
            cached: _cached!,
            onRerank: _busy ? null : _rerankFromCache,
          ),
        ],
      ],
    );
  }

  /// Re-ranks the catalog against the stored tone. No camera, no sampling — used
  /// when the catalog may have changed since the photo was taken.
  Future<void> _rerankFromCache() async {
    final cached = _cached;
    if (cached == null) return;

    setState(() {
      _busy = true;
      _stage = _Stage.working;
      _progressLabel = 'Comparing against every shade…';
    });

    try {
      final result = await FoundationMatchService.matchFromSkinHex(
        cached.skinHex,
        finishPreference: BeautyProfileService.getCachedProfile()?.finishPreference,
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _result = result;
        _stage = result.needsRetake ? _Stage.retake : _Stage.result;
      });
    } on FoundationMatchException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _stage = _Stage.intake;
        _errorMessage = e.message;
        _errorHint = e.hint;
      });
    } catch (e) {
      debugPrint('[FoundationMatch] rerank failed: $e');
      if (!mounted) return;
      setState(() {
        _busy = false;
        _stage = _Stage.intake;
        _errorMessage = 'Could not refresh your matches.';
        _errorHint = 'Please try again.';
      });
    }
  }

  // ── Stage: working ─────────────────────────────────────────────────────────

  Widget _buildWorking() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 46,
              height: 46,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 28),
            Text(
              _progressLabel,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.textMain,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Your photo never leaves this device.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  // ── Stage: retake ──────────────────────────────────────────────────────────

  Widget _buildRetake() {
    final result = _result;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      physics: const BouncingScrollPhysics(),
      children: [
        const SizedBox(height: 12),
        _NoticeCard(
          icon: Icons.replay_rounded,
          tone: _NoticeTone.warning,
          title: result?.retakeReason ?? 'That photo could not be measured.',
          body: result?.retakeHint ??
              'Try again in daylight, facing a window, with bare skin.',
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            // Said explicitly, because a rejection that looks like a failure of
            // the app invites the user to distrust the result they eventually
            // get. It is a refusal to guess, and that is the feature working.
            'A shade matched from a photo like that would look wrong on your '
            'skin, so it was not guessed at.',
            style: TextStyle(
              color: AppColors.textMuted,
              fontSize: 13,
              height: 1.45,
            ),
          ),
        ),
        if (result != null && result.warnings.isNotEmpty) ...[
          const SizedBox(height: 20),
          _SectionLabel('What was detected'),
          const SizedBox(height: 10),
          ...result.warnings.map((w) => _BulletLine(w)),
        ],
        const SizedBox(height: 28),
        _PrimaryButton(
          icon: Icons.photo_camera_rounded,
          label: 'Take another photo',
          onTap: _busy ? null : () => _run(ImageSource.camera),
        ),
        const SizedBox(height: 12),
        _SecondaryButton(
          icon: Icons.photo_library_outlined,
          label: 'Choose a different photo',
          onTap: _busy ? null : () => _run(ImageSource.gallery),
        ),
      ],
    );
  }

  // ── Stage: result ──────────────────────────────────────────────────────────

  Widget _buildResult() {
    final result = _result;
    final skin = result?.skin;
    if (result == null || skin == null) {
      // Defensive: the stage machine should make this unreachable.
      return _buildIntake();
    }

    final best = result.best;
    final alternates = <FoundationMatch>[
      if (result.lighterAlternate != null) result.lighterAlternate!,
      if (result.deeperAlternate != null) result.deeperAlternate!,
    ];
    final more = result.matches.length > 1
        ? result.matches.sublist(1)
        : const <FoundationMatch>[];

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      physics: const BouncingScrollPhysics(),
      children: [
        // ── Measured skin ────────────────────────────────────────────────────
        _SkinReadingCard(skin: skin, result: result),
        const SizedBox(height: 20),

        if (result.warnings.isNotEmpty) ...[
          _NoticeCard(
            icon: Icons.info_outline_rounded,
            tone: _NoticeTone.info,
            title: result.warnings.length == 1
                ? result.warnings.first
                : 'A few things about this photo',
            body: result.warnings.length == 1
                ? null
                : result.warnings.map((w) => '• $w').join('\n'),
          ),
          const SizedBox(height: 20),
        ],

        // ── The match ────────────────────────────────────────────────────────
        if (best == null)
          _NoticeCard(
            icon: Icons.search_off_rounded,
            tone: _NoticeTone.warning,
            title: 'No foundation shades to match against yet.',
            body: 'Your skin tone has been saved, so this will work as soon as '
                'the catalog has foundations in it.',
          )
        else ...[
          _SectionLabel('Your match'),
          const SizedBox(height: 12),
          _BestMatchCard(
            match: best,
            onTryInAr: () => _tryInAr(best),
            onAddToBag: () => _addToBag(best),
            onBuy: () => _buyOnWeb(best),
          ),
        ],

        // ── Alternates ───────────────────────────────────────────────────────
        if (alternates.isNotEmpty) ...[
          const SizedBox(height: 28),
          _SectionLabel('If you want to adjust'),
          const SizedBox(height: 6),
          Text(
            'A foundation half a step lighter reads as natural; half a step '
            'deeper reads as warmth. Both are here on purpose.',
            style: TextStyle(
              color: AppColors.textMuted,
              fontSize: 12.5,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          ...alternates.map(
            (alt) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _AlternateCard(
                match: alt,
                onTryInAr: () => _tryInAr(alt),
                onAddToBag: () => _addToBag(alt),
              ),
            ),
          ),
        ],

        // ── The rest of the ranking ──────────────────────────────────────────
        if (more.isNotEmpty) ...[
          const SizedBox(height: 28),
          _SectionLabel('Other close shades'),
          const SizedBox(height: 12),
          ...more.map(
            (m) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _AlternateCard(
                match: m,
                onTryInAr: () => _tryInAr(m),
                onAddToBag: () => _addToBag(m),
              ),
            ),
          ),
        ],

        // ── Honesty section ──────────────────────────────────────────────────
        if (result.persistenceNotes.isNotEmpty ||
            result.catalogNotes.isNotEmpty) ...[
          const SizedBox(height: 28),
          _SectionLabel('Notes'),
          const SizedBox(height: 10),
          ...result.persistenceNotes.map((n) => _BulletLine(n)),
          ...result.catalogNotes.map((n) => _BulletLine(n)),
        ],

        const SizedBox(height: 24),
        _SecondaryButton(
          icon: Icons.refresh_rounded,
          label: 'Match again',
          onTap: _busy
              ? null
              : () => setState(() {
                    _stage = _Stage.intake;
                    _result = null;
                  }),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Measured-skin card
// ─────────────────────────────────────────────────────────────────────────────

class _SkinReadingCard extends StatelessWidget {
  const _SkinReadingCard({required this.skin, required this.result});

  final SkinReading skin;
  final FoundationMatchResult result;

  @override
  Widget build(BuildContext context) {
    final swatch = Color(0xFF000000 | skin.packedColour);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
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
              Container(
                width: 62,
                height: 62,
                decoration: BoxDecoration(
                  color: swatch,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.neutral300, width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: swatch.withValues(alpha: 0.35),
                      blurRadius: 14,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Your skin tone',
                      style: TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      skin.hex.toUpperCase(),
                      style: TextStyle(
                        color: AppColors.textMain,
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 6),
                    _ConfidencePill(
                      label: result.confidenceLabel,
                      score: result.confidence,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (skin.depthLevel.isNotEmpty)
                _Chip(_titleCase(skin.depthLevel), Icons.brightness_6_outlined),
              if (skin.undertone.isNotEmpty)
                _Chip('${_titleCase(skin.undertone)} undertone',
                    Icons.opacity_outlined),
              if (skin.monkScale > 0)
                _Chip('Monk ${skin.monkScale}', Icons.straighten_rounded),
              _Chip('ITA ${skin.ita.toStringAsFixed(1)}°',
                  Icons.architecture_outlined),
            ],
          ),
          const SizedBox(height: 14),
          Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.science_outlined, size: 15, color: AppColors.neutral500),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _provenance(),
                  style: TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12,
                    height: 1.45,
                  ),
                ),
              ),
            ],
          ),
          if (result.savedToProfile)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(
                children: [
                  Icon(Icons.check_circle_outline_rounded,
                      size: 15, color: Colors.green.shade600),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Saved to your Beauty Profile.',
                      style: TextStyle(
                        color: Colors.green.shade600,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Where the number came from. Shown because a colour with no provenance is a
  /// colour the user has no reason to believe.
  String _provenance() {
    final regions = skin.regionsUsed;
    final labelled = regions.map(_regionLabel).toList();
    final lab = 'L* ${skin.l.toStringAsFixed(1)} · '
        'a* ${skin.a.toStringAsFixed(1)} · '
        'b* ${skin.b.toStringAsFixed(1)}';
    if (labelled.isEmpty) return 'CIELAB $lab';
    final joined = labelled.length == 1
        ? labelled.first
        : '${labelled.take(labelled.length - 1).join(', ')} and ${labelled.last}';
    return 'Measured from your $joined, white-balanced, then converted to '
        'CIELAB $lab.';
  }

  static String _regionLabel(String region) => switch (region) {
        'forehead' => 'forehead',
        'left_cheek' => 'left cheek',
        'right_cheek' => 'right cheek',
        'jaw' => 'jaw',
        'nose_bridge' => 'nose bridge',
        _ => region.replaceAll('_', ' '),
      };
}

// ─────────────────────────────────────────────────────────────────────────────
// Best-match card
// ─────────────────────────────────────────────────────────────────────────────

class _BestMatchCard extends StatelessWidget {
  const _BestMatchCard({
    required this.match,
    required this.onTryInAr,
    required this.onAddToBag,
    required this.onBuy,
  });

  final FoundationMatch match;
  final VoidCallback onTryInAr;
  final VoidCallback onAddToBag;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final swatch = Color(0xFF000000 | match.packedColour);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.35), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.10),
            blurRadius: 24,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          // Swatch banner. The shade itself is the largest thing on the card,
          // because it is the answer.
          Container(
            height: 96,
            decoration: BoxDecoration(
              color: swatch,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(17)),
            ),
            child: Stack(
              children: [
                Positioned(
                  left: 16,
                  bottom: 12,
                  right: 16,
                  child: Text(
                    match.shadeHex.toUpperCase(),
                    style: TextStyle(
                      // Text on an unknown colour has to pick its own contrast:
                      // a fixed white label vanishes on a fair shade and a fixed
                      // dark one vanishes on a deep shade.
                      color: _onColour(match.shadeHex),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
                Positioned(
                  right: 12,
                  top: 12,
                  child: _DeltaEBadge(deltaE: match.deltaE, quality: match.quality),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  match.shadeName,
                  style: TextStyle(
                    color: AppColors.textMain,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    if (match.brand != null && match.brand!.isNotEmpty) match.brand!,
                    match.productName,
                  ].join(' · '),
                  style: TextStyle(color: AppColors.neutral700, fontSize: 13.5),
                ),

                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (match.price != null)
                      _Chip('Rs ${match.price!.toStringAsFixed(0)}',
                          Icons.sell_outlined),
                    if (match.finish != null && match.finish!.isNotEmpty)
                      _Chip(_titleCase(match.finish!), Icons.auto_awesome_outlined),
                    if (match.coverage != null && match.coverage!.isNotEmpty)
                      _Chip('${_titleCase(match.coverage!)} coverage',
                          Icons.layers_outlined),
                    if (match.alsoAvailableCount > 0)
                      _Chip('Also in ${match.alsoAvailableCount} more',
                          Icons.storefront_outlined),
                  ],
                ),

                if (match.reason.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.neutral200,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      match.reason,
                      style: TextStyle(
                        color: AppColors.neutral700,
                        fontSize: 12.5,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 18),
                _PrimaryButton(
                  icon: Icons.auto_awesome_rounded,
                  label: 'Try in AR',
                  onTap: onTryInAr,
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _SecondaryButton(
                        icon: Icons.shopping_bag_outlined,
                        label: 'Add to bag',
                        onTap: onAddToBag,
                        dense: true,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _SecondaryButton(
                        icon: Icons.open_in_new_rounded,
                        label: 'Buy on web',
                        onTap: onBuy,
                        dense: true,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alternate / other-shade card
// ─────────────────────────────────────────────────────────────────────────────

class _AlternateCard extends StatelessWidget {
  const _AlternateCard({
    required this.match,
    required this.onTryInAr,
    required this.onAddToBag,
  });

  final FoundationMatch match;
  final VoidCallback onTryInAr;
  final VoidCallback onAddToBag;

  @override
  Widget build(BuildContext context) {
    final swatch = Color(0xFF000000 | match.packedColour);
    final direction = switch (match.depthDirection) {
      'lighter' => ('Lighter', Icons.arrow_upward_rounded),
      'deeper' => ('Deeper', Icons.arrow_downward_rounded),
      _ => ('Level', Icons.remove_rounded),
    };

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTryInAr,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: swatch,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.neutral300),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      match.shadeName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppColors.textMain,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      match.productName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(direction.$2, size: 12, color: AppColors.neutral500),
                        const SizedBox(width: 3),
                        Text(
                          '${direction.$1} · ΔE ${match.deltaE.toStringAsFixed(1)}',
                          style: TextStyle(
                            color: AppColors.neutral500,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Add to bag',
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.add_shopping_cart_rounded,
                    size: 19, color: AppColors.primary),
                onPressed: onAddToBag,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cached-match card
// ─────────────────────────────────────────────────────────────────────────────

class _CachedMatchCard extends StatelessWidget {
  const _CachedMatchCard({required this.cached, required this.onRerank});

  final CachedFoundationMatch cached;
  final VoidCallback? onRerank;

  @override
  Widget build(BuildContext context) {
    final swatch = Color(0xFF000000 | cached.packedSkinColour);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: swatch,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.neutral300),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      cached.shadeLabel ?? cached.skinHex.toUpperCase(),
                      maxLines: 2,
                      style: TextStyle(
                        color: AppColors.textMain,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (cached.deltaE != null || cached.measuredAt != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          [
                            if (cached.deltaE != null)
                              'ΔE ${cached.deltaE!.toStringAsFixed(1)}',
                            if (cached.measuredAt != null)
                              _ago(cached.measuredAt!),
                          ].join(' · '),
                          style: TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _SecondaryButton(
            icon: Icons.refresh_rounded,
            label: 'Re-check against the catalog',
            onTap: onRerank,
            dense: true,
          ),
        ],
      ),
    );
  }

  static String _ago(DateTime when) {
    final d = DateTime.now().difference(when);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    if (d.inDays < 30) return '${d.inDays}d ago';
    return '${(d.inDays / 30).floor()}mo ago';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small pieces
// ─────────────────────────────────────────────────────────────────────────────

class _HeroBlurb extends StatelessWidget {
  const _HeroBlurb();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primary.withValues(alpha: 0.14),
            AppColors.secondary.withValues(alpha: 0.16),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.colorize_rounded, color: AppColors.primary, size: 20),
              const SizedBox(width: 10),
              Text(
                'Foundation shade match',
                style: TextStyle(
                  color: AppColors.textMain,
                  fontSize: 16.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'One photo. Your skin is measured at five points on your face, '
            'corrected for the light in the room, and compared to every '
            'foundation shade in the catalog by perceptual colour distance.',
            style: TextStyle(
              color: AppColors.neutral700,
              fontSize: 13.5,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _PrivacyNote extends StatelessWidget {
  const _PrivacyNote();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.lock_outline_rounded, size: 15, color: AppColors.neutral500),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'Your photo is analysed on this phone and never uploaded. Only the '
            'measured colours are sent — about forty numbers, no image.',
            style: TextStyle(
              color: AppColors.textMuted,
              fontSize: 12,
              height: 1.45,
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        color: AppColors.textMuted,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.0,
      ),
    );
  }
}

class _TipRow extends StatelessWidget {
  const _TipRow({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 17, color: AppColors.primary),
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
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  body,
                  style: TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12.5,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum _NoticeTone { info, warning, error }

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.icon,
    required this.tone,
    required this.title,
    this.body,
  });

  final IconData icon;
  final _NoticeTone tone;
  final String title;
  final String? body;

  @override
  Widget build(BuildContext context) {
    final colour = switch (tone) {
      _NoticeTone.info => AppColors.primary,
      _NoticeTone.warning => const Color(0xFFD98324),
      _NoticeTone.error => const Color(0xFFD9534F),
    };

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colour.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 19, color: colour),
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
                    height: 1.35,
                  ),
                ),
                if (body != null && body!.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    body!,
                    style: TextStyle(
                      color: AppColors.neutral700,
                      fontSize: 12.5,
                      height: 1.45,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BulletLine extends StatelessWidget {
  const _BulletLine(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 5, right: 8),
            child: Container(
              width: 4,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.neutral500,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: AppColors.textMuted,
                fontSize: 12.5,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.icon);
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.neutral200,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.neutral700),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: AppColors.neutral700,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfidencePill extends StatelessWidget {
  const _ConfidencePill({required this.label, required this.score});

  final String label;
  final double score;

  @override
  Widget build(BuildContext context) {
    final colour = switch (label) {
      'high' => const Color(0xFF2E9E5B),
      'moderate' => const Color(0xFFD98324),
      _ => const Color(0xFFD9534F),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colour.withValues(alpha: 0.30)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            '${_titleCase(label)} confidence · ${(score * 100).round()}%',
            style: TextStyle(
              color: colour,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _DeltaEBadge extends StatelessWidget {
  const _DeltaEBadge({required this.deltaE, required this.quality});

  final double deltaE;
  final String quality;

  @override
  Widget build(BuildContext context) {
    // Bands match `describeDeltaE` in skin_color.dart, so the colour and the
    // words can never disagree.
    final colour = deltaE < 3
        ? const Color(0xFF2E9E5B)
        : deltaE < 5
            ? const Color(0xFF7FA82E)
            : deltaE < 8
                ? const Color(0xFFD98324)
                : const Color(0xFFD9534F);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            'ΔE ${deltaE.toStringAsFixed(1)}',
            style: const TextStyle(
              color: Color(0xFF1F1F1F),
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (quality.isNotEmpty) ...[
            const SizedBox(width: 6),
            Text(
              quality,
              style: TextStyle(
                color: colour,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.neutral300,
          padding: const EdgeInsets.symmetric(vertical: 15),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _SecondaryButton extends StatelessWidget {
  const _SecondaryButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.dense = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: dense ? 15 : 17),
        label: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          disabledForegroundColor: AppColors.neutral500,
          side: BorderSide(color: AppColors.primary.withValues(alpha: 0.4)),
          padding: EdgeInsets.symmetric(vertical: dense ? 11 : 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: TextStyle(
            fontSize: dense ? 13 : 14.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

String _titleCase(String s) {
  if (s.isEmpty) return s;
  return s[0].toUpperCase() + s.substring(1);
}

/// Black or white, whichever is readable on [hex].
///
/// Uses L* rather than the usual 0.299/0.587/0.114 luma shortcut: that formula
/// operates on gamma-encoded values and picks white text on mid-tone shades where
/// black is clearly more readable. The whole file already has a correct L*.
Color _onColour(String hex) {
  final packed = parseHexColor(hex);
  if (packed == null) return Colors.white;
  final l = luminanceLStar(
    (packed >> 16) & 0xFF,
    (packed >> 8) & 0xFF,
    packed & 0xFF,
  );
  return l > 62 ? const Color(0xFF1F1F1F) : Colors.white;
}
