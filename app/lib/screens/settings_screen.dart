import 'package:flutter/material.dart';

import '../main.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _server;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _server = TextEditingController(text: AppScope.of(context).baseUrl);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Signed in as', style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(height: 4),
                Text(
                  state.user?['displayName']?.toString() ??
                      state.user?['username']?.toString() ??
                      'admin',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _server,
          decoration: const InputDecoration(labelText: 'Server URL', prefixIcon: Icon(Icons.dns)),
          keyboardType: TextInputType.url,
          autocorrect: false,
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () async {
            await state.setBaseUrl(_server.text);
            await state.refresh();
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Server URL saved')));
            }
          },
          icon: const Icon(Icons.save),
          label: const Text('Save server URL'),
        ),
        const Divider(height: 32),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Colors.red),
          onPressed: () => state.logout(),
          icon: const Icon(Icons.logout),
          label: const Text('Sign out'),
        ),
        const SizedBox(height: 24),
        const Center(
          child: Text('RDM · Remote Download Manager', style: TextStyle(color: Colors.grey, fontSize: 12)),
        ),
      ],
    );
  }
}
