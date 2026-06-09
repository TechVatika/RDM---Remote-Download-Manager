import {
  HiSquares2X2,
  HiPlusCircle,
  HiArrowDownTray,
  HiClock,
  HiChartBar,
  HiGlobeAlt,
  HiKey,
  HiBookmark,
  HiQueueList,
  HiCog6Tooth,
  HiCpuChip,
  HiShieldCheck,
  HiQuestionMarkCircle,
  HiUserCircle,
  HiDocumentText,
} from 'react-icons/hi2';

export const NAV_GROUPS = [
  {
    id: 'main',
    label: 'Downloads',
    items: [
      { id: 'overview', label: 'Overview', Icon: HiSquares2X2 },
      { id: 'new', label: 'New Download', Icon: HiPlusCircle },
      { id: 'active', label: 'Active Queue', Icon: HiArrowDownTray, badge: 'active' },
      { id: 'history', label: 'History', Icon: HiClock, badge: 'failed' },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    items: [
      { id: 'bookmarks', label: 'Bookmarks', Icon: HiBookmark },
      { id: 'activity', label: 'Activity Feed', Icon: HiQueueList },
      { id: 'analytics', label: 'Analytics', Icon: HiChartBar },
    ],
  },
  {
    id: 'platforms',
    label: 'Platforms',
    items: [
      { id: 'platforms', label: 'Supported Sites', Icon: HiGlobeAlt },
      { id: 'platform-settings', label: 'Platform Auth', Icon: HiKey },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'account', label: 'My Account', Icon: HiUserCircle },
      { id: 'app-settings', label: 'App Settings', Icon: HiCog6Tooth },
      { id: 'system', label: 'System Health', Icon: HiCpuChip },
      { id: 'logs', label: 'Activity Logs', Icon: HiDocumentText },
      { id: 'security', label: 'Security', Icon: HiShieldCheck },
      { id: 'help', label: 'How It Works', Icon: HiQuestionMarkCircle },
    ],
  },
];

export const NAV = NAV_GROUPS.flatMap((group) => group.items);

export const VIEW_SUBTITLES = {
  overview: 'Your personal home-server download hub',
  new: 'Paste a link, drop a URL, or queue bulk downloads',
  active: 'Live progress with IDM-style segmented downloads',
  history: 'Completed, failed, and cancelled jobs',
  bookmarks: 'Saved URLs for one-click re-queuing',
  activity: 'Live timeline of recent download events',
  analytics: 'Download stats, trends, and storage breakdown',
  platforms: 'Sites supported via yt-dlp & direct HTTP',
  'platform-settings': 'Instagram, Facebook & cookie-gated platform auth',
  account: 'Change your login password and view account details',
  'app-settings': 'Paths, connections, AI naming & preferences',
  system: 'Server health, disk space & engine status',
  logs: 'Live server log of downloads, queue & WARP events',
  security: 'Active protections hardening your server',
  help: 'Quick start guide and download tips',
};

export function getNavLabel(viewId) {
  return NAV.find((item) => item.id === viewId)?.label || 'Dashboard';
}

export function getNavSubtitle(viewId) {
  return VIEW_SUBTITLES[viewId] || 'Personal remote download manager';
}
