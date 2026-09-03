import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class FavouritesCache extends ChangeNotifier {
  FavouritesCache._();
  static final FavouritesCache instance = FavouritesCache._();

  // Store format: "productKey__shadeKey" (shadeKey can be empty)
  final Set<String> _favouriteKeys = {};
  List<Map<String, dynamic>> _rawFavourites = [];
  bool _isLoading = false;
 RealtimeChannel? _channel;
  String? _listeningUserId;

  bool get isLoading => _isLoading;
  bool get isEmpty => _rawFavourites.isEmpty;
  List<Map<String, dynamic>> get favourites =>
      List.unmodifiable(_rawFavourites);

  bool isFavourite(String productKey, String? shadeKey) {
    final key = '${productKey}__${shadeKey ?? ''}';
    return _favouriteKeys.contains(key);
  }

  Future<void> prefetch(String userId) async {
    _isLoading = true;
    notifyListeners();
    try {
      final res = await Supabase.instance.client
          .from('user_favourites')
          .select('id, product_key, shade_key, created_at')
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      _rawFavourites = _dedupe(
        List<Map<String, dynamic>>.from(res),
      ); // 🆕 dedupe use karo
      _favouriteKeys.clear();
      for (var item in _rawFavourites) {
        final pk = item['product_key'] as String;
        final sk = item['shade_key'] as String?;
        _favouriteKeys.add('${pk}__${sk ?? ''}');
      }
    } catch (e) {
      debugPrint('❌ Favourites fetch failed: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

void listenRealtime(String userId) {
  if (_listeningUserId == userId && _channel != null) return;

  if (_channel != null) {
    Supabase.instance.client.removeChannel(_channel!);
  }
  _listeningUserId = userId;

  final session = Supabase.instance.client.auth.currentSession;
  if (session != null) {
    Supabase.instance.client.realtime.setAuth(session.accessToken);
  }

  _channel = Supabase.instance.client
      .channel('favourites-$userId')
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'user_favourites',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'user_id',
          value: userId,
        ),
        callback: (payload) {
          debugPrint('✅ Favourites realtime event: ${payload.eventType}');

          if (payload.eventType == PostgresChangeEvent.delete) {
            final oldRow = payload.oldRecord;
            final pk = oldRow['product_key'] as String?;
            final sk = oldRow['shade_key'] as String?;
            if (pk != null) {
              final key = '${pk}__${sk ?? ''}';
              _favouriteKeys.remove(key);
              _rawFavourites.removeWhere(
                  (f) => f['product_key'] == pk && (f['shade_key'] ?? '') == (sk ?? ''));
            }
          } else {
            // INSERT ya UPDATE
            final row = payload.newRecord;
            final pk = row['product_key'] as String?;
            final sk = row['shade_key'] as String?;
            if (pk != null) {
              final key = '${pk}__${sk ?? ''}';
              if (!_favouriteKeys.contains(key)) {
                _favouriteKeys.add(key);
                _rawFavourites.insert(0, row);
              }
            }
          }
          notifyListeners();
        },
      )
      .subscribe((status, error) {
        if (status == RealtimeSubscribeStatus.subscribed) {
          debugPrint('✅ Favourites realtime connected');
        } else if (error != null) {
          debugPrint('❌ Favourites realtime error: $error');
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

  Future<void> toggleFavourite(String productKey, String? shadeKey) async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;

    final normalizedShade =
        shadeKey ?? ''; // 🆕 hamesha string, kabhi null nahi
    final key = '${productKey}__$normalizedShade';
    final isCurrentlyFav = _favouriteKeys.contains(key);

    if (isCurrentlyFav) {
      _favouriteKeys.remove(key);
      _rawFavourites.removeWhere(
        (f) =>
            f['product_key'] == productKey &&
            (f['shade_key'] ?? '') == normalizedShade,
      );
    } else {
      _favouriteKeys.add(key);
      _rawFavourites.insert(0, {
        'product_key': productKey,
        'shade_key': normalizedShade,
        'created_at': DateTime.now().toIso8601String(),
      });
    }
    notifyListeners();

    try {
      if (isCurrentlyFav) {
        await Supabase.instance.client
            .from('user_favourites')
            .delete()
            .eq('user_id', userId)
            .eq('product_key', productKey)
            .eq('shade_key', normalizedShade); // 🆕 pehle .isFilter(...) tha
      } else {
        await Supabase.instance.client
            .from('user_favourites')
            .upsert(
              {
                'user_id': userId,
                'product_key': productKey,
                'shade_key': normalizedShade,
              },
              onConflict: 'user_id,product_key,shade_key',
              ignoreDuplicates:
                  true, // 🆕 duplicate insert error ki jagah silently skip
            );
      }
    } catch (e) {
      debugPrint('❌ Favourite sync failed: $e');
      if (isCurrentlyFav) {
        _favouriteKeys.add(key);
      } else {
        _favouriteKeys.remove(key);
      }
      notifyListeners();
    }
  }

  void clear() {
    _favouriteKeys.clear();
    _rawFavourites.clear();
    stopListening();
    notifyListeners();
  }

  @override
  void dispose() {
    stopListening();
    super.dispose();
  }
}
