import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';

const STORAGE_KEY = 'penny-theme';

const MASK_URL = '/theme-cat.gif';
const MASK_WAIT_MS = 400;

function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let maskReady = null;

export function preloadThemeMask() {
  if (!maskReady) {
    const img = new Image();
    img.src = MASK_URL;
    maskReady = img.decode().then(
      () => true,
      () => {
        maskReady = null;
        return false;
      }
    );
  }
  return maskReady;
}

function canAnimate() {
  return (
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (!canAnimate()) return setTheme(next);

    const ready = await Promise.race([
      preloadThemeMask(),
      new Promise((resolve) => setTimeout(() => resolve(false), MASK_WAIT_MS)),
    ]);
    if (!ready) return setTheme(next);

    document.startViewTransition(() => {
      document.documentElement.classList.toggle('dark', next === 'dark');
      flushSync(() => setTheme(next));
    });
  };

  return { theme, toggle };
}
