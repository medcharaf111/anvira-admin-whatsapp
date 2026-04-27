'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

/**
 * Debounced search input that pushes `?q=...` into the URL so server pages
 * can filter on the same query.
 */
export function SearchInput({
  placeholder = 'بحث',
  paramKey = 'q',
}: {
  placeholder?: string;
  paramKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(paramKey) ?? '');

  // Debounce updates
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set(paramKey, value.trim());
      else next.delete(paramKey);
      router.replace(`${pathname}?${next.toString()}`);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      className="relative flex items-center"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <Search
        className="absolute right-3 w-4 h-4 pointer-events-none"
        style={{ color: 'var(--ink-faint)' }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent text-sm focus:outline-none w-full pr-9 pl-9 py-2"
        style={{ color: 'var(--ink)' }}
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute left-2 w-6 h-6 flex items-center justify-center"
          style={{ color: 'var(--ink-faint)' }}
          aria-label="مسح"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
