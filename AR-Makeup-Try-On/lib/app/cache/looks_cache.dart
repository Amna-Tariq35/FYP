// looks_cache.dart
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LooksCache {
  LooksCache._();
  static final LooksCache instance = LooksCache._();

  // ── State ──────────────────────────────────────────────────────────────────
  List<Map<String, dynamic>> _looks = [];
  bool _loaded = false;
  bool _loading = false;
  Completer<void>? _prefetchCompleter;

  // Expose read-only view
  List<Map<String, dynamic>> get looks => List.unmodifiable(_looks);
  bool get isLoaded => _loaded;
  bool get isLoading => _loading;

  // ── File helpers ───────────────────────────────────────────────────────────
  Future<File> get _cacheFile async {
    final dir = await getApplicationSupportDirectory();
    return File('${dir.path}/saved_looks_cache.json');
  }

  // ── Listeners ──────────────────────────────────────────────────────────────
  final List<VoidCallback> _listeners = [];
  void addListener(VoidCallback cb) => _listeners.add(cb);
  void removeListener(VoidCallback cb) => _listeners.remove(cb);
  void _notify() {
    for (final cb in _listeners) {
      cb();
    }
  }

  // ── Load from cache file (offline) ─────────────────────────────────────────
  Future<void> _loadFromCacheFile() async {
    try {
      final file = await _cacheFile;
      if (!await file.exists()) return;

      final contents = await file.readAsString();
      if (contents.isEmpty) return;

      final jsonData = jsonDecode(contents) as List<dynamic>;
      _looks = jsonData
          .map((item) => Map<String, dynamic>.from(item as Map<String, dynamic>))
          .toList();
      debugPrint('✓ Loaded ${_looks.length} looks from offline cache');
    } catch (e) {
      debugPrint('⚠️ Offline cache load failed: $e');
      _looks = [];
    }
  }

  // ── Save to cache file ─────────────────────────────────────────────────────
  Future<void> _saveToCacheFile() async {
    try {
      final file = await _cacheFile;
      await file.writeAsString(jsonEncode(_looks), flush: true);
    } catch (e) {
      debugPrint('⚠️ Cache file write failed: $e');
    }
  }

  // ── Prefetch (from network, fallback to offline) ────────────────────────────
  Future<void> prefetch(String userId, {bool force = false}) async {
    if (_loaded && !force) return;

    // Agar already load ho raha hai — naya call mat karo, existing ka wait karo
    if (_loading && _prefetchCompleter != null) {
      return _prefetchCompleter!.future;
    }

    _loading = true;
    _prefetchCompleter = Completer<void>();

    try {
      // Pehle offline cache load karo
      await _loadFromCacheFile();

      // Phir network se fetch karne ki koshish karo
      try {
        final response = await Supabase.instance.client
            .from('saved_looks')
            .select()
            .eq('user_id', userId)
            .order('created_at', ascending: false)
            .timeout(
              const Duration(seconds: 8),
              onTimeout: () => throw TimeoutException('Network timeout'),
            );
        _looks = List<Map<String, dynamic>>.from(response);
        _loaded = true;
        // Success — save to cache for offline use
        await _saveToCacheFile();
        _notify();
        _prefetchCompleter!.complete();
      } on SocketException catch (e) {
        // Network error — use offline cache
        debugPrint('⚠️ Network error: $e. Using offline cache.');
        _loaded = true;
        _notify();
        _prefetchCompleter!.complete();
      } on TimeoutException catch (e) {
        // Timeout — use offline cache
        debugPrint('⚠️ Network timeout: $e. Using offline cache.');
        _loaded = true;
        _notify();
        _prefetchCompleter!.complete();
      }
    } catch (e) {
      debugPrint('❌ LooksCache prefetch error: $e');
      _loaded = true;
      // Even if everything fails, we still have offline cache
      _notify();
      _prefetchCompleter!.completeError(e);
    } finally {
      _loading = false;
      _prefetchCompleter = null;
    }
  }

  // ── Optimistic insert ──────────────────────────────────────────────────────
  void optimisticAdd(Map<String, dynamic> look) {
    _looks.insert(0, look);
    _notify();
    // Persist to cache immediately
    _saveToCacheFile();
  }

  // ── Update a look in-place ─────────────────────────────────────────────────
  void updateLook(String lookId, Map<String, dynamic> patch) {
    final idx = _looks.indexWhere((l) => l['id'] == lookId);
    if (idx != -1) {
      _looks[idx] = {..._looks[idx], ...patch};
      _notify();
      // Persist to cache immediately
      _saveToCacheFile();
    }
  }

  // ── Update favourite flag ──────────────────────────────────────────────────
  void setFavourite(String lookId, bool value) {
    updateLook(lookId, {'is_favourite': value});
  }

  // ── Remove ─────────────────────────────────────────────────────────────────
  void remove(String lookId) {
    _looks.removeWhere((l) => l['id'] == lookId);
    _notify();
    // Persist to cache immediately
    _saveToCacheFile();
  }

  // ── Hard refresh ───────────────────────────────────────────────────────────
  Future<void> refresh(String userId) {
    _loaded = false; // force block karo chahe _loading true ho
    return prefetch(userId, force: true);
  }

  // ── Clear on logout ────────────────────────────────────────────────────────
  void clear() {
    _looks = [];
    _loaded = false;
    _loading = false;
    _prefetchCompleter = null;
    _notify();
    _saveToCacheFile();
  }
}