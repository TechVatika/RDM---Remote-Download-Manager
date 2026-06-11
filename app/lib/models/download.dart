class Download {
  final int id;
  final String url;
  final String? title;
  final String status; // queued | downloading | paused | completed | failed | cancelled
  final double progress; // 0..100
  final int? fileSize;
  final int bytesDownloaded;
  final String type; // http | media
  final String? mediaKind;
  final String? errorMessage;
  final String? filePath;
  final bool needsAuth;

  Download({
    required this.id,
    required this.url,
    required this.status,
    required this.progress,
    required this.bytesDownloaded,
    required this.type,
    this.title,
    this.fileSize,
    this.mediaKind,
    this.errorMessage,
    this.filePath,
    this.needsAuth = false,
  });

  bool get isActive => status == 'queued' || status == 'downloading' || status == 'paused';
  bool get isFinished => status == 'completed' || status == 'failed' || status == 'cancelled';
  String get displayName => (title != null && title!.isNotEmpty) ? title! : url;

  static int? _toInt(dynamic v) => v == null ? null : int.tryParse(v.toString());

  factory Download.fromJson(Map<String, dynamic> j) {
    return Download(
      id: _toInt(j['id']) ?? 0,
      url: j['url']?.toString() ?? '',
      title: j['title']?.toString(),
      status: j['status']?.toString() ?? 'queued',
      progress: double.tryParse('${j['progress'] ?? 0}') ?? 0,
      fileSize: _toInt(j['file_size']),
      bytesDownloaded: _toInt(j['bytes_downloaded']) ?? 0,
      type: j['type']?.toString() ?? 'http',
      mediaKind: j['media_kind']?.toString(),
      errorMessage: j['error_message']?.toString(),
      filePath: j['file_path']?.toString(),
      needsAuth: (_toInt(j['needs_auth']) ?? 0) == 1,
    );
  }
}

String formatBytes(int? bytes) {
  if (bytes == null || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  double v = bytes.toDouble();
  int i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return '${v.toStringAsFixed(i == 0 ? 0 : 1)} ${units[i]}';
}
