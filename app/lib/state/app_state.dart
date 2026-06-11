import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../models/download.dart';

/// Single source of truth: auth, server URL, and the polled download list.
class AppState extends ChangeNotifier {
  late ApiClient _api;
  String baseUrl = kDefaultBaseUrl;
  String? _token;
  Map<String, dynamic>? user;

  bool booting = true;
  bool get isLoggedIn => _token != null;

  List<Download> downloads = [];
  String? listError;
  Timer? _poll;

  List<Download> get active => downloads.where((d) => d.isActive).toList();
  List<Download> get history => downloads.where((d) => d.isFinished).toList();

  Future<void> boot() async {
    final prefs = await SharedPreferences.getInstance();
    baseUrl = prefs.getString(kBaseUrlKey) ?? kDefaultBaseUrl;
    _token = prefs.getString(kTokenKey);
    _api = ApiClient(baseUrl: baseUrl, token: _token);

    if (_token != null) {
      try {
        user = await _api.get('/api/auth/me') as Map<String, dynamic>;
        _startPolling();
      } catch (_) {
        await _clearToken();
      }
    }
    booting = false;
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    baseUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
    _api.baseUrl = baseUrl;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(kBaseUrlKey, baseUrl);
    notifyListeners();
  }

  Future<void> login(String username, String password) async {
    final res = await _api.post('/api/auth/login', {
      'username': username,
      'password': password,
    }) as Map<String, dynamic>;
    _token = res['token'] as String;
    user = res['user'] as Map<String, dynamic>?;
    _api.token = _token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(kTokenKey, _token!);
    _startPolling();
    notifyListeners();
  }

  Future<void> logout() async {
    _poll?.cancel();
    await _clearToken();
    downloads = [];
    notifyListeners();
  }

  Future<void> _clearToken() async {
    _token = null;
    user = null;
    _api.token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(kTokenKey);
  }

  void _startPolling() {
    _poll?.cancel();
    refresh();
    _poll = Timer.periodic(const Duration(seconds: 2), (_) => refresh());
  }

  Future<void> refresh() async {
    try {
      final data = await _api.get('/api/downloads') as List;
      downloads = data.map((e) => Download.fromJson(e as Map<String, dynamic>)).toList();
      listError = null;
    } on ApiException catch (e) {
      if (e.status == 401) {
        await logout();
        return;
      }
      listError = e.message;
    }
    notifyListeners();
  }

  Future<void> queueDownload({
    required String url,
    required String category,
    int connections = 8,
    bool aiRename = true,
  }) async {
    await _api.post('/api/downloads', {
      'url': url,
      'category': category,
      'type': 'http',
      'connections': connections,
      'ai_rename': aiRename,
    });
    await refresh();
  }

  Future<void> _action(int id, String action) async {
    await _api.post('/api/downloads/$id/$action');
    await refresh();
  }

  Future<void> pause(int id) => _action(id, 'pause');
  Future<void> resume(int id) => _action(id, 'resume');
  Future<void> cancel(int id) => _action(id, 'cancel');
  Future<void> retry(int id) => _action(id, 'retry');

  Future<void> remove(int id) async {
    await _api.delete('/api/downloads/$id');
    await refresh();
  }

  Future<void> submitCredentials(int id, String username, String password) async {
    await _api.post('/api/downloads/$id/credentials', {
      'username': username,
      'password': password,
    });
    await refresh();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }
}
