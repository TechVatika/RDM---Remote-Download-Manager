import 'package:flutter/material.dart';

import '../models/download.dart';
import '../state/app_state.dart';

class DownloadCard extends StatelessWidget {
  final Download item;
  final AppState state;
  const DownloadCard({super.key, required this.item, required this.state});

  Color _statusColor(BuildContext context) {
    switch (item.status) {
      case 'completed':
        return Colors.green;
      case 'failed':
        return Colors.red;
      case 'downloading':
        return Theme.of(context).colorScheme.primary;
      case 'paused':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  Future<void> _confirm(BuildContext context, String title, Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Confirm')),
        ],
      ),
    );
    if (ok == true) await action();
  }

  Future<void> _credentials(BuildContext context) async {
    final user = TextEditingController();
    final pass = TextEditingController();
    final creds = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('🔒 Login required'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: user, decoration: const InputDecoration(hintText: 'Username')),
            const SizedBox(height: 8),
            TextField(controller: pass, obscureText: true, decoration: const InputDecoration(hintText: 'Password')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sign in & retry')),
        ],
      ),
    );
    if (creds == true && user.text.trim().isNotEmpty) {
      await state.submitCredentials(item.id, user.text.trim(), pass.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pct = (item.progress).clamp(0, 100).toDouble();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: _statusColor(context).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(item.status,
                      style: TextStyle(color: _statusColor(context), fontWeight: FontWeight.w600, fontSize: 12)),
                ),
                const SizedBox(width: 8),
                Text('#${item.id}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 8),
            Text(item.displayName, maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            if (item.isActive) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(value: pct / 100, minHeight: 7),
              ),
              const SizedBox(height: 6),
              Text(
                '${pct.toStringAsFixed(1)}%  ·  ${formatBytes(item.bytesDownloaded)} / ${formatBytes(item.fileSize)}',
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
            if (item.status == 'completed' && item.filePath != null)
              Text(item.filePath!, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Colors.grey)),
            if (item.needsAuth)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('🔒 Needs a login (username & password).',
                    style: TextStyle(color: Colors.orange.shade800, fontSize: 13)),
              )
            else if (item.status == 'failed' && item.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(item.errorMessage!, style: const TextStyle(color: Colors.red, fontSize: 12)),
              ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              children: _actions(context),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _actions(BuildContext context) {
    final a = <Widget>[];
    if (item.status == 'downloading') {
      a.add(TextButton(onPressed: () => state.pause(item.id), child: const Text('Pause')));
    }
    if (item.status == 'paused') {
      a.add(TextButton(onPressed: () => state.resume(item.id), child: const Text('Resume')));
    }
    if (item.isActive) {
      a.add(TextButton(
          onPressed: () => _confirm(context, 'Cancel download?', () => state.cancel(item.id)),
          child: const Text('Cancel')));
    }
    if (item.needsAuth) {
      a.add(FilledButton(onPressed: () => _credentials(context), child: const Text('Sign in & retry')));
    } else if (item.status == 'failed' || item.status == 'cancelled') {
      a.add(TextButton(onPressed: () => state.retry(item.id), child: const Text('Retry')));
    }
    if (item.isFinished) {
      a.add(TextButton(
          onPressed: () => _confirm(context, 'Remove from list?', () => state.remove(item.id)),
          child: const Text('Remove', style: TextStyle(color: Colors.red))));
    }
    return a;
  }
}
