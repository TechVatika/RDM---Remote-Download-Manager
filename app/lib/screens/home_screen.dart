import 'package:flutter/material.dart';

import '../main.dart';
import '../state/app_state.dart';
import '../widgets/download_card.dart';
import 'new_download_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final titles = ['Active Queue', 'History', 'New Download', 'Settings'];

    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            title: Text(titles[_tab]),
            actions: [
              if (_tab < 2)
                IconButton(onPressed: () => state.refresh(), icon: const Icon(Icons.refresh)),
            ],
          ),
          body: _body(state),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: state.active.isNotEmpty,
                  label: Text('${state.active.length}'),
                  child: const Icon(Icons.download),
                ),
                label: 'Active',
              ),
              const NavigationDestination(icon: Icon(Icons.history), label: 'History'),
              const NavigationDestination(icon: Icon(Icons.add_circle_outline), label: 'New'),
              const NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
            ],
          ),
        );
      },
    );
  }

  Widget _body(AppState state) {
    switch (_tab) {
      case 0:
        return _list(state, state.active, 'Nothing downloading', 'Queue a URL from the New tab.');
      case 1:
        return _list(state, state.history, 'No history yet', 'Completed and failed downloads appear here.');
      case 2:
        return const NewDownloadScreen();
      default:
        return const SettingsScreen();
    }
  }

  Widget _list(AppState state, List items, String emptyTitle, String emptySub) {
    if (state.listError != null && items.isEmpty) {
      return _Empty(icon: Icons.cloud_off, title: 'Connection problem', sub: state.listError!);
    }
    if (items.isEmpty) {
      return _Empty(icon: Icons.inbox, title: emptyTitle, sub: emptySub);
    }
    return RefreshIndicator(
      onRefresh: state.refresh,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: items.length,
        itemBuilder: (c, i) => DownloadCard(item: items[i], state: state),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  final IconData icon;
  final String title;
  final String sub;
  const _Empty({required this.icon, required this.title, required this.sub});
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: Colors.grey),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(sub, textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
