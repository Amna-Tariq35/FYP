import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MakeupBagCache extends ChangeNotifier {
  MakeupBagCache._();
  static final MakeupBagCache instance = MakeupBagCache._();

  static const String _prefsKey = 'makeup_bag_items_cache';

  // Store format: "productKey__shadeKey"
  final Set<String> _bagKeys = {};
  List<Map<String, dynamic>> _rawItems = [];
  bool _isLoading = false;
  RealtimeChannel? _channel;
  String? _listeningUserId;
  String? _defaultBagId;

  bool get isLoading => _isLoading;
  bool get isEmpty => _rawItems.isEmpty;
  List<Map<String, dynamic>> get items => List.unmodifiable(_rawItems);
  String? get defaultBagId => _defaultBagId;

  bool isInBag(String productKey, String? shadeKey) {
    final key = '${productKey}__${shadeKey ?? ''}';
    return _bagKeys.contains(key);
  }

  Future<void> prefetch(String userId) async {
    _isLoading = true;
    notifyListeners();

    // Load from local cache first for offline support
    await _loadFromLocalCache();

    try {
      // Get the default bag for the user
      final bagRes = await Supabase.instance.client
          .from('makeup_bags')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'My Everyday Bag')
          .limit(1)
          .maybeSingle();

      if (bagRes == null) {
        // Create default bag if none exists
        final newBag = await Supabase.instance.client
            .from('makeup_bags')
            .insert({'user_id': userId, 'name': 'My Everyday Bag'})
            .select('id')
            .single();
        _defaultBagId = newBag['id'];
      } else {
        _defaultBagId = bagRes['id'];
      }

      if (_defaultBagId != null) {
        // Fetch items
        final itemsRes = await Supabase.instance.client
            .from('makeup_bag_items')
            .select('id, product_key, shade_key, added_at')
            .eq('bag_id', _defaultBagId!)
            .order('added_at', ascending: false);

        _rawItems = _dedupe(List<Map<String, dynamic>>.from(itemsRes));
        
        _bagKeys.clear();
        for (var item in _rawItems) {
          final pk = item['product_key'] as String;
          final sk = item['shade_key'] as String?;
          _bagKeys.add('${pk}__${sk ?? ''}');
        }
        
        // Save to local cache
        await _saveToLocalCache();
      }
    } catch (e) {
      debugPrint('❌ Makeup bag fetch failed: $e');
      // If we fail (e.g. offline), we already loaded from local cache
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> _loadFromLocalCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedString = prefs.getString(_prefsKey);
      if (cachedString != null) {
        final List<dynamic> decoded = jsonDecode(cachedString);
        _rawItems = decoded.map((e) => Map<String, dynamic>.from(e)).toList();
        _bagKeys.clear();
        for (var item in _rawItems) {
          final pk = item['product_key'] as String;
          final sk = item['shade_key'] as String?;
          _bagKeys.add('${pk}__${sk ?? ''}');
        }
        notifyListeners();
      }
    } catch (e) {
      debugPrint('❌ Local makeup bag cache load failed: $e');
    }
  }

  Future<void> _saveToLocalCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(_rawItems));
    } catch (e) {
      debugPrint('❌ Local makeup bag cache save failed: $e');
    }
  }

  void listenRealtime(String userId) {
    if (_listeningUserId == userId && _channel != null) return;
    if (_defaultBagId == null) return;

    if (_channel != null) {
      Supabase.instance.client.removeChannel(_channel!);
    }
    _listeningUserId = userId;

    final session = Supabase.instance.client.auth.currentSession;
    if (session != null) {
      Supabase.instance.client.realtime.setAuth(session.accessToken);
    }

    _channel = Supabase.instance.client
        .channel('makeup_bag-$userId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'makeup_bag_items',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'bag_id',
            value: _defaultBagId!,
          ),
          callback: (payload) {
            debugPrint('✅ Makeup bag realtime event: ${payload.eventType}');

            if (payload.eventType == PostgresChangeEvent.delete) {
              final oldRow = payload.oldRecord;
              final pk = oldRow['product_key'] as String?;
              final sk = oldRow['shade_key'] as String?;
              if (pk != null) {
                final key = '${pk}__${sk ?? ''}';
                _bagKeys.remove(key);
                _rawItems.removeWhere(
                    (f) => f['product_key'] == pk && (f['shade_key'] ?? '') == (sk ?? ''));
              }
            } else {
              // INSERT or UPDATE
              final row = payload.newRecord;
              final pk = row['product_key'] as String?;
              final sk = row['shade_key'] as String?;
              if (pk != null) {
                final key = '${pk}__${sk ?? ''}';
                if (!_bagKeys.contains(key)) {
                  _bagKeys.add(key);
                  _rawItems.insert(0, row);
                }
              }
            }
            _saveToLocalCache();
            notifyListeners();
          },
        )
        .subscribe((status, error) {
          if (status == RealtimeSubscribeStatus.subscribed) {
            debugPrint('✅ Makeup bag realtime connected');
          } else if (error != null) {
            debugPrint('❌ Makeup bag realtime error: $error');
            _listeningUserId = null;
            Future.delayed(const Duration(seconds: 5), () {
              if (Supabase.instance.client.auth.currentUser?.id == userId) {
                listenRealtime(userId);
              }
            });
          }
        });
  }

  void stopListening() {
    if (_channel != null) {
      Supabase.instance.client.removeChannel(_channel!);
    }
    _channel = null;
    _listeningUserId = null;
    _defaultBagId = null;
  }

  List<Map<String, dynamic>> _dedupe(List<Map<String, dynamic>> rows) {
    final seen = <String>{};
    final result = <Map<String, dynamic>>[];
    for (final row in rows) {
      final key = '${row['product_key']}__${row['shade_key'] ?? ''}';
      if (seen.add(key)) result.add(row);
    }
    return result;
  }

  Future<void> toggleInBag(String productKey, String? shadeKey) async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;
    
    if (_defaultBagId == null) {
      // Try fetching it if it was null
      await prefetch(userId);
      if (_defaultBagId == null) return;
    }

    final normalizedShade = shadeKey ?? ''; 
    final key = '${productKey}__$normalizedShade';
    final isCurrentlyInBag = _bagKeys.contains(key);

    if (isCurrentlyInBag) {
      _bagKeys.remove(key);
      _rawItems.removeWhere(
        (f) =>
            f['product_key'] == productKey &&
            (f['shade_key'] ?? '') == normalizedShade,
      );
    } else {
      _bagKeys.add(key);
      _rawItems.insert(0, {
        'product_key': productKey,
        'shade_key': normalizedShade,
        'added_at': DateTime.now().toIso8601String(),
      });
    }
    _saveToLocalCache();
    notifyListeners();

    try {
      if (isCurrentlyInBag) {
        await Supabase.instance.client
            .from('makeup_bag_items')
            .delete()
            .eq('bag_id', _defaultBagId!)
            .eq('product_key', productKey)
            .eq('shade_key', normalizedShade);
      } else {
        await Supabase.instance.client
            .from('makeup_bag_items')
            .insert({
              'user_id': userId,
              'bag_id': _defaultBagId,
              'product_key': productKey,
              'shade_key': shadeKey, // use original nullable
            });
      }
    } on Exception catch (e) {
      if (!isCurrentlyInBag && e.toString().contains('23505')) {
        // Unique violation, ignore because it means it was already added
        return;
      }
      debugPrint('❌ Makeup bag sync failed: $e');
      if (isCurrentlyInBag) {
        _bagKeys.add(key);
      } else {
        _bagKeys.remove(key);
      }
      _saveToLocalCache();
      notifyListeners();
    }
  }

  void clear() {
    _bagKeys.clear();
    _rawItems.clear();
    stopListening();
    _saveToLocalCache(); // clear cache
    notifyListeners();
  }

  @override
  void dispose() {
    stopListening();
    super.dispose();
  }
}

