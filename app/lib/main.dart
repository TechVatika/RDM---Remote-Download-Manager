import 'package:flutter/material.dart';

import 'state/app_state.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const RdmApp());
}

/// Exposes the shared [AppState] to the widget tree.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
      : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope not found in context');
    return scope!.notifier!;
  }
}

class RdmApp extends StatefulWidget {
  const RdmApp({super.key});
  @override
  State<RdmApp> createState() => _RdmAppState();
}

class _RdmAppState extends State<RdmApp> {
  final AppState _state = AppState();

  @override
  void initState() {
    super.initState();
    _state.boot();
  }

  @override
  void dispose() {
    _state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: _state,
      child: MaterialApp(
        title: 'RDM',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: ThemeMode.system,
        home: AnimatedBuilder(
          animation: _state,
          builder: (context, _) {
            if (_state.booting) {
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            }
            return _state.isLoggedIn ? const HomeScreen() : const LoginScreen();
          },
        ),
      ),
    );
  }
}
