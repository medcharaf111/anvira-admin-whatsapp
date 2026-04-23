'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('theme')) as Theme | null;
    const initial: Theme = stored ?? 'light';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function applyTheme(next: Theme) {
    const root = document.documentElement;
    if (next === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    localStorage.setItem('theme', next);
  }

  if (!theme) {
    // Placeholder during hydration to avoid layout shift
    return <div className="w-16 h-8" aria-hidden />;
  }

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
      className="relative w-16 h-8 rounded-full transition-colors"
      style={{
        background: 'var(--paper-sink)',
        border: '1px solid var(--rule)',
      }}
    >
      {/* Icons pinned to each end */}
      <span
        className="absolute top-1/2 -translate-y-1/2 left-2 pointer-events-none"
        style={{ color: isDark ? 'var(--ink-faint)' : 'var(--paper)', transition: 'color 0.3s ease' }}
      >
        <Sun className="w-3.5 h-3.5" strokeWidth={1.8} />
      </span>
      <span
        className="absolute top-1/2 -translate-y-1/2 right-2 pointer-events-none"
        style={{ color: isDark ? 'var(--paper)' : 'var(--ink-faint)', transition: 'color 0.3s ease' }}
      >
        <Moon className="w-3.5 h-3.5" strokeWidth={1.8} />
      </span>

      {/* Animated thumb — absolute-positioned with top offset (NOT -translate-y-1/2 — framer's x transform would override it) */}
      <motion.span
        className="absolute w-6 h-6 rounded-full"
        style={{
          top: 3,
          left: 0,
          background: 'var(--ink)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}
        animate={{ x: isDark ? 34 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      />
    </button>
  );
}

/**
 * Inline script run before paint to set the theme and prevent flash.
 * Drop this in <head> via a dangerouslySetInnerHTML in layout.tsx.
 */
export const themeBootstrapScript = `
  (function() {
    try {
      var t = localStorage.getItem('theme');
      if (t === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    } catch (e) {}
  })();
`;
