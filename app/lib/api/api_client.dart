import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message;
  final int? status;
  ApiException(this.message, [this.status]);
  @override
  String toString() => message;
}

/// Thin HTTP wrapper that attaches the bearer token and decodes JSON.
class ApiClient {
  String baseUrl;
  String? token;

  ApiClient({required this.baseUrl, this.token});

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  dynamic _decode(http.Response res) {
    final body = res.body.isEmpty ? {} : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    final msg = (body is Map && body['error'] != null)
        ? body['error'].toString()
        : 'Request failed (${res.statusCode})';
    throw ApiException(msg, res.statusCode);
  }

  Future<dynamic> get(String path) async {
    try {
      return _decode(await http.get(_uri(path), headers: _headers).timeout(const Duration(seconds: 20)));
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('Cannot reach server. Check the server URL & network.');
    }
  }

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    try {
      return _decode(await http
          .post(_uri(path), headers: _headers, body: jsonEncode(body ?? {}))
          .timeout(const Duration(seconds: 20)));
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('Cannot reach server. Check the server URL & network.');
    }
  }

  Future<dynamic> delete(String path) async {
    try {
      return _decode(await http.delete(_uri(path), headers: _headers).timeout(const Duration(seconds: 20)));
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('Cannot reach server. Check the server URL & network.');
    }
  }
}
