/** Lightweight desktop-notification helpers. No-ops when unsupported/denied. */

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Ask for permission once, ideally from a user gesture (e.g. queuing). */
export async function requestNotifyPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function desktopNotify(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  // Don't notify a focused tab — the in-app toast already covers that.
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    const n = new Notification(title, { body, tag: 'rdm-download', icon: '/favicon.ico' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}
