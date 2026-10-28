// lib/app/services/beauty_profile_service.dart
//
// Service for managing user beauty profile data:
// - Fetch profile from backend
// - Save profile to backend
// - Calculate undertone from questionnaire responses
// - Pre-fill questionnaire from web analysis data

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../cache/beauty_profile_model.dart';
import '../config/app_config.dart';

class BeautyProfileService {
  BeautyProfileService._();

  static final supabase = Supabase.instance.client;

  /// Base URL for the beauty profile API endpoint
  static String get _apiUrl => '${AppConfig.webBaseUrl}/api/beauty-profile';

  /// Get auth header with current session token
  static Future<Map<String, String>> get _authHeaders async {
    final session = supabase.auth.currentSession;
    if (session == null) {
      throw Exception('Not authenticated');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${session.accessToken}',
    };
  }

  // ── FETCH ──────────────────────────────────────────────────────────────────

  /// Fetch user's current beauty profile from backend.
  /// Returns empty profile if none exists.
  static Future<UserBeautyProfile> fetchProfile() async {
    try {
      final headers = await _authHeaders;
      final response = await http.get(
        Uri.parse(_apiUrl),
        headers: headers,
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return UserBeautyProfile.fromJson(json);
      } else if (response.statusCode == 401) {
        throw Exception('Unauthorized');
      }

      return UserBeautyProfile();
    } catch (e) {
      print('[BeautyProfileService] fetchProfile error: $e');
      return UserBeautyProfile();
    }
  }

  /// Fetch pre-fill data from web analysis.
  /// Used to populate questionnaire defaults if user has already done web analysis.
  static Future<Map<String, dynamic>> fetchPreFillData() async {
    try {
      final headers = await _authHeaders;
      final uri = Uri.parse(_apiUrl).replace(queryParameters: {'prefill': 'true'});
      final response = await http.get(uri, headers: headers)
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }

      return {};
    } catch (e) {
      print('[BeautyProfileService] fetchPreFillData error: $e');
      return {};
    }
  }

  // ── SAVE ───────────────────────────────────────────────────────────────────

  /// Last save failure, one sentence, safe to show in the questionnaire.
  static String? lastSaveError;

  /// Save beauty profile for the signed-in user.
  ///
  /// Writes `user_skin_profiles` with the app session. The hosted
  /// `/api/beauty-profile` route answered every failure with
  /// "Failed to save profile", and that route's upsert requires a unique
  /// `user_id` the tracked SQL never creates. Update-or-insert does not.
  static Future<bool> saveProfile(UserBeautyProfile profile) async {
    lastSaveError = null;
    try {
      final user = supabase.auth.currentUser;
      if (user == null) {
        lastSaveError = 'Sign in again, then save your beauty profile.';
        return false;
      }

      final row = <String, dynamic>{
        'user_id': user.id,
        ...profile.toJson(),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      };
      await _mergeSource(row, user.id);
      await _writeProfile(row, user.id);
      return true;
    } on PostgrestException catch (e) {
      lastSaveError = _publicSaveError(e.message);
      print('[BeautyProfileService] saveProfile error: ${e.message}');
      return false;
    } catch (e) {
      lastSaveError = 'Could not save your beauty profile.';
      print('[BeautyProfileService] saveProfile error: $e');
      return false;
    }
  }

  static Future<void> _mergeSource(Map<String, dynamic> row, String userId) async {
    final incoming = row['source'] as String? ?? 'manual';
    try {
      final prior = await supabase
          .from('user_skin_profiles')
          .select('source')
          .eq('user_id', userId)
          .limit(1);
      final rows = List<Map<String, dynamic>>.from(prior as List);
      final old = rows.isEmpty ? null : rows.first['source'];
      if (old is String && old != incoming && old != 'both') {
        row['source'] = 'both';
      }
    } on PostgrestException catch (e) {
      if (_missingColumn(e.message) == 'source') {
        row.remove('source');
        return;
      }
      rethrow;
    }
  }

  static Future<void> _writeProfile(Map<String, dynamic> row, String userId) async {
    var payload = Map<String, dynamic>.from(row);
    // One drop per missing column, then one extra attempt. Stops when the
    // error is not a single absent column, or when that column is user_id.
    final maxAttempts = payload.length + 1;
    PostgrestException? last;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        final existing = await supabase
            .from('user_skin_profiles')
            .select('user_id')
            .eq('user_id', userId)
            .limit(1);
        final hasRow = (existing as List).isNotEmpty;
        if (hasRow) {
          final patch = Map<String, dynamic>.from(payload)..remove('user_id');
          await supabase.from('user_skin_profiles').update(patch).eq('user_id', userId);
        } else {
          await supabase.from('user_skin_profiles').insert(payload);
        }
        return;
      } on PostgrestException catch (e) {
        last = e;
        final missing = _missingColumn(e.message);
        if (missing == null || missing == 'user_id' || !payload.containsKey(missing)) {
          rethrow;
        }
        payload.remove(missing);
        print('[BeautyProfileService] schema cache has no $missing; retrying without it');
      }
    }
    if (last != null) throw last;
  }

  static String? _missingColumn(String message) {
    final schema = message.contains('schema cache') || message.contains('does not exist');
    if (!schema) return null;
    final quoted = RegExp("'([a-z0-9_]+)' column", caseSensitive: false).firstMatch(message);
    if (quoted != null) return quoted.group(1);
    final plain = RegExp(r'column "([a-z0-9_]+)"', caseSensitive: false).firstMatch(message);
    return plain?.group(1);
  }

  static String _publicSaveError(String message) {
    final text = message.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (text.isEmpty || text.length > 180) {
      return 'Could not save your beauty profile.';
    }
    return text;
  }

  // ── UNDERTONE CALCULATION ──────────────────────────────────────────────────

  /// Calculate undertone from 3-question heuristic quiz.
  /// 
  /// Uses published undertone analysis methodology:
  /// - Vein color (blue/purple = cool, green = warm)
  /// - Jewelry preference (silver = cool, gold = warm)
  /// - Sun reaction (burns = cool, tans = warm)
  /// 
  /// Returns calculated undertone: 'cool', 'warm', 'neutral', or 'olive'
  static String calculateUndertone(UndertoneQuizResult quiz) {
    return quiz.calculateUndertone();
  }

  // ── DEPTH FALLBACK ─────────────────────────────────────────────────────────

  /// Determine approximate skin tone hex from depth level.
  /// Used as fallback if photo analysis isn't available.
  /// 
  /// Returns median hex color for the selected depth tier.
  static String? depthToHex(String? depthLevel) {
    if (depthLevel == null) return null;

    final swatch = DepthSwatch.fromLevel(depthLevel);
    return swatch?.hex;
  }

  /// Infer depth level from hex color (reverse lookup).
  /// Useful for displaying depth when hex is available but depth wasn't explicitly set.
  static String? hexToDepth(String? hex) {
    if (hex == null) return null;

    // Simple approach: find closest swatch by hex comparison
    // In a real app, you'd use color distance (ΔE) for better accuracy.
    for (final swatch in DepthSwatch.all) {
      if (swatch.hex.toLowerCase() == hex.toLowerCase()) {
        return swatch.level;
      }
    }

    return null;
  }

  // ── LOCAL CACHE ────────────────────────────────────────────────────────────

  /// In-memory cache of the current user's beauty profile.
  /// Updated when profile is fetched or saved.
  static UserBeautyProfile? _cachedProfile;

  /// Get cached profile (if available).
  static UserBeautyProfile? getCachedProfile() => _cachedProfile;

  /// Set cached profile.
  static void setCachedProfile(UserBeautyProfile? profile) {
    _cachedProfile = profile;
  }

  /// Clear cached profile (e.g., on logout).
  static void clearCache() {
    _cachedProfile = null;
  }
}
