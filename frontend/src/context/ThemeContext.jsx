import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'rdm-theme';
const THEMES = ['light', 'dark', 'system'];

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(theme) {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);
  const [resolved, setResolved] = useState(() => resolve(readStored()));

  const apply = useCallback((t) => {
    const r = resolve(t);
    setResolved(r);
    document.documentElement.dataset.theme = r;
    document.documentElement.style.colorScheme = r;
  }, []);

  // Apply on mount + whenever the choice changes.
  useEffect(() => {
    apply(theme);
  }, [theme, apply]);

  // Follow the OS when set to "system".
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, apply]);

  const setTheme = useCallback((t) => {
    const next = THEMES.includes(t) ? t : 'system';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setThemeState(next);
  }, []);

  // Cycle light -> dark -> system -> light
  const toggle = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, isDark: resolved === 'dark', setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext) ?? {
    theme: 'system',
    resolved: 'light',
    isDark: false,
    setTheme: () => {},
    toggle: () => {},
  };
}
