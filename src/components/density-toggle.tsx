'use client';
import { useEffect, useState } from 'react';
import { Rows3, Rows2 } from 'lucide-react';

/**
 * Compact / comfortable density toggle. Persists in localStorage and
 * applies a `data-density="compact"` attribute to <html> so list pages
 * can react with CSS. Default = comfortable.
 */
export type Density = 'compact' | 'comfortable';

function readDensity(): Density {
  if (typeof window === 'undefined') return 'comfortable';
  const v = localStorage.getItem('anvira-density');
  return v === 'compact' ? 'compact' : 'comfortable';
}

function applyDensity(d: Density) {
  document.documentElement.setAttribute('data-density', d);
}

export function DensityToggle() {
  const [density, setDensity] = useState<Density | null>(null);

  useEffect(() => {
    const d = readDensity();
    setDensity(d);
    applyDensity(d);
  }, []);

  function toggle() {
    const next: Density = density === 'compact' ? 'comfortable' : 'compact';
    setDensity(next);
    applyDensity(next);
    localStorage.setItem('anvira-density', next);
  }

  if (!density) return <div className="w-9 h-9" aria-hidden />;

  const Icon = density === 'compact' ? Rows3 : Rows2;
  return (
    <button
      type="button"
      onClick={toggle}
      title={density === 'compact' ? 'الكثافة: مدمج' : 'الكثافة: مريح'}
      aria-label="تبديل كثافة العرض"
      className="inline-flex items-center justify-center w-9 h-9"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        color: density === 'compact' ? 'var(--gold-soft)' : 'var(--ink-faint)',
        borderRadius: '3px',
        transition: 'color 0.2s ease, border-color 0.2s ease',
      }}
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </button>
  );
}
