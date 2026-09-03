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

  /// Save beauty profile to backend.
  /// Creates new record if doesn't exist, updates if it does.
  static Future<bool> saveProfile(UserBeautyProfile profile) async {
    try {
      final headers = await _authHeaders;
      final payload = profile.toJson();

      final response = await http.post(
        Uri.parse(_apiUrl),
        headers: headers,
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        if (json.containsKey('profile')) {
          return true;
        }
      } else if (response.statusCode == 401) {
        throw Exception('Unauthorized');
      }

      return false;
    } catch (e) {
      print('[BeautyProfileService] saveProfile error: $e');
      return false;
    }
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
