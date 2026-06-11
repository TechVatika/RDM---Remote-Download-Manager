import 'package:flutter/material.dart';

import '../config.dart';
import '../main.dart';

class NewDownloadScreen extends StatefulWidget {
  const NewDownloadScreen({super.key});
  @override
  State<NewDownloadScreen> createState() => _NewDownloadScreenState();
}

class _NewDownloadScreenState extends State<NewDownloadScreen> {
  final _url = TextEditingController();
  String _category = kCategories.first;
  double _connections = 8;
  bool _aiRename = true;
  bool _loading = false;

  Future<void> _submit() async {
    final state = AppScope.of(context);
    final url = _url.text.trim();
    if (url.isEmpty) return;
    setState(() => _loading = true);
    try {
      await state.queueDownload(
        url: url,
        category: _category,
        connections: _connections.round(),
        aiRename: _aiRename,
      );
      _url.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Download queued')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _url,
          minLines: 1,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'URL',
            hintText: 'https://… (video, post, or direct file)',
            prefixIcon: Icon(Icons.link),
          ),
          keyboardType: TextInputType.url,
          autocorrect: false,
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: _category,
          decoration: const InputDecoration(labelText: 'Category', prefixIcon: Icon(Icons.folder)),
          items: kCategories
              .map((c) => DropdownMenuItem(value: c, child: Text(c[0].toUpperCase() + c.substring(1))))
              .toList(),
          onChanged: (v) => setState(() => _category = v ?? _category),
        ),
        const SizedBox(height: 16),
        Text('Connections: ${_connections.round()}', style: const TextStyle(fontWeight: FontWeight.w600)),
        Slider(
          value: _connections,
          min: 1,
          max: 16,
          divisions: 15,
          label: '${_connections.round()}',
          onChanged: (v) => setState(() => _connections = v),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('AI smart rename'),
          subtitle: const Text('Let the server name the file descriptively'),
          value: _aiRename,
          onChanged: (v) => setState(() => _aiRename = v),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _loading ? null : _submit,
          icon: _loading
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.download),
          label: const Text('Queue download'),
        ),
      ],
    );
  }
}
