import { HiServerStack } from 'react-icons/hi2';

export default function ServerDownloadBanner({ compact = false }) {
  if (compact) {
    return (
      <p className="server-download-note server-download-note--compact">
        <HiServerStack size={16} aria-hidden />
        Runs on your server — safe to close this tab or shut your laptop.
      </p>
    );
  }

  return (
    <div className="server-download-banner" role="status">
      <HiServerStack size={22} className="server-download-banner-icon" aria-hidden />
      <div>
        <strong>Remote downloads</strong>
        <p>
          Once queued, downloads run on your home server — not in this browser tab.
          You can log out, close this page, shut down your PC, or switch devices; the download keeps going.
          Large files auto-resume if the CDN drops the connection — partial progress is saved on disk.
        </p>
      </div>
    </div>
  );
}
