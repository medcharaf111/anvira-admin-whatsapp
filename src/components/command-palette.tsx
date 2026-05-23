'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  MessageSquare,
  Bell,
  Users,
  Building2,
  CalendarDays,
  Calendar,
  Home,
  DollarSign,
  Shield,
  FileText,
  ScrollText,
  BarChart3,
  BookOpen,
  Settings,
  Smartphone,
  Crown,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import type { ClientType } from '@/lib/client';

/* ------------------------------------------------------------------ *
 * CommandPalette — Cmd/Ctrl + K
 *
 * Sources of openness:
 *   • Hotkey (Cmd/Ctrl+K, also '/' when not in input)
 *   • Custom event: anvira:open-command-palette
 *
 * Searches:
 *   • Pages (static, this file)
 *   • (Hook points open for future leads/properties/conversations
 *     indexing — query routed via /api/search?q=... when available)
 *
 * Fuzzy match: lightweight subsequence + bonus for prefix; good enough
 * for ~30 entries and zero deps.
 * ------------------------------------------------------------------ */

type Entry = {
  id: string;
  type: 'page' | 'action';
  label: string;
  labelLat?: string;
  group: string;
  href?: string;
  action?: () => void;
  icon: LucideIcon;
  onlyFor?: ClientType[];
  founderOnly?: boolean;
};

function buildEntries(clientType: ClientType, isOperator: boolean): Entry[] {
  const all: Entry[] = [
    // Daily ops
    { id: 'conversations', type: 'page', label: 'المحادثات', labelLat: 'Conversations', group: 'DAILY OPS', href: '/conversations', icon: MessageSquare },
    { id: 'alerts', type: 'page', label: 'التنبيهات', labelLat: 'Alerts', group: 'DAILY OPS', href: '/alerts', icon: Bell },
    { id: 'leads', type: 'page', label: 'العملاء المحتملين', labelLat: 'Leads', group: 'DAILY OPS', href: '/leads', icon: Users, onlyFor: ['real_estate'] },
    { id: 'viewings', type: 'page', label: 'المعاينات', labelLat: 'Viewings', group: 'DAILY OPS', href: '/viewings', icon: Building2, onlyFor: ['real_estate'] },
    { id: 'calendar', type: 'page', label: 'التقويم', labelLat: 'Calendar', group: 'DAILY OPS', href: '/calendar', icon: CalendarDays },
    { id: 'bookings', type: 'page', label: 'المواعيد', labelLat: 'Bookings', group: 'DAILY OPS', href: '/bookings', icon: Calendar },

    // Catalog
    { id: 'properties', type: 'page', label: 'العقارات', labelLat: 'Properties', group: 'CATALOG', href: '/properties', icon: Building2, onlyFor: ['real_estate'] },
    { id: 'projects', type: 'page', label: 'المشاريع', labelLat: 'Projects', group: 'CATALOG', href: '/projects', icon: Home, onlyFor: ['real_estate'] },
    { id: 'payment-plans', type: 'page', label: 'خطط السداد', labelLat: 'Payment Plans', group: 'CATALOG', href: '/payment-plans', icon: DollarSign, onlyFor: ['real_estate'] },

    // Compliance
    { id: 'kyc', type: 'page', label: 'الامتثال و AML', labelLat: 'Compliance & AML', group: 'COMPLIANCE', href: '/kyc', icon: Shield, onlyFor: ['real_estate'] },
    { id: 'forms', type: 'page', label: 'النماذج', labelLat: 'RERA Forms', group: 'COMPLIANCE', href: '/forms', icon: FileText, onlyFor: ['real_estate'] },
    { id: 'audit', type: 'page', label: 'سجل النشاط', labelLat: 'Audit', group: 'COMPLIANCE', href: '/audit', icon: ScrollText },

    // Insights
    { id: 'analytics', type: 'page', label: 'التحليلات', labelLat: 'Analytics', group: 'INSIGHTS', href: '/analytics', icon: BarChart3 },

    // Setup
    { id: 'knowledge-base', type: 'page', label: 'قاعدة المعرفة', labelLat: 'Knowledge Base', group: 'SETUP', href: '/knowledge-base', icon: BookOpen },
    { id: 'templates', type: 'page', label: 'الردود الجاهزة', labelLat: 'Templates', group: 'SETUP', href: '/templates', icon: FileText },
    { id: 'settings', type: 'page', label: 'الإعدادات', labelLat: 'Settings', group: 'SETUP', href: '/settings', icon: Settings },

    // Tools
    { id: 'mock-phone', type: 'page', label: 'هاتف التجربة', labelLat: 'Mock Phone', group: 'TOOLS', href: '/mock-phone', icon: Smartphone },
    { id: 'operator', type: 'page', label: 'إدارة العملاء', labelLat: 'Operator', group: 'TOOLS', href: '/operator', icon: Crown, founderOnly: true },
  ];

  return all
    .filter((e) => !e.onlyFor || e.onlyFor.includes(clientType))
    .filter((e) => !e.founderOnly || isOperator);
}

// Subsequence fuzzy score — higher is better. Empty query returns 1
// for everything so the list still renders.
function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100 + q.length;
  if (t.includes(q)) return 50 + q.length;
  let qi = 0;
  let score = 0;
  let prevMatch = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti - prevMatch === 1 ? 2 : 1;
      prevMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export function CommandPalette({
  clientType,
  isOperator,
}: {
  clientType: ClientType;
  isOperator: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () => buildEntries(clientType, isOperator),
    [clientType, isOperator]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    return entries
      .map((e) => ({
        e,
        score: Math.max(
          fuzzyScore(query, e.label),
          fuzzyScore(query, e.labelLat || ''),
          fuzzyScore(query, e.group)
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.e);
  }, [entries, query]);

  // Group filtered for display — keep original group order
  const grouped = useMemo(() => {
    const order = ['DAILY OPS', 'CATALOG', 'COMPLIANCE', 'INSIGHTS', 'SETUP', 'TOOLS'];
    const m = new Map<string, Entry[]>();
    for (const e of filtered) {
      if (!m.has(e.group)) m.set(e.group, []);
      m.get(e.group)!.push(e);
    }
    return order.filter((g) => m.has(g)).map((g) => ({ group: g, items: m.get(g)! }));
  }, [filtered]);

  // Flat indexable list — selection moves through this
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelected(0);
  }, []);

  const choose = useCallback(
    (e: Entry) => {
      if (e.href) router.push(e.href);
      else if (e.action) e.action();
      close();
    },
    [router, close]
  );

  // Hotkey + custom-event listeners
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const isTyping =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;

      // Cmd/Ctrl + K toggles
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // '/' opens (only when not in an input)
      if (ev.key === '/' && !isTyping && !open) {
        ev.preventDefault();
        setOpen(true);
      }
    }
    function onCustom() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('anvira:open-command-palette', onCustom);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('anvira:open-command-palette', onCustom);
    };
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setSelected(0);
      // microtask so the input has mounted
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelected(0);
  }, [query]);

  function onListKey(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
      return;
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, flat.length - 1)));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const e = flat[selected];
      if (e) choose(e);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100]"
            style={{
              background: 'color-mix(in srgb, var(--paper-sink) 60%, transparent)',
              backdropFilter: 'blur(8px)',
            }}
            onClick={close}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[12vh] z-[101] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2"
            role="dialog"
            aria-modal="true"
            aria-label="لوحة الأوامر"
            style={{
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              borderRadius: '6px',
              boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Input */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <Search
                className="w-4 h-4"
                strokeWidth={1.5}
                style={{ color: 'var(--ink-faint)' }}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKey}
                placeholder="ابحث عن صفحة..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--ink)' }}
              />
              <kbd className="kbd">ESC</kbd>
            </div>

            {/* Results */}
            <div
              className="max-h-[60vh] overflow-y-auto no-scrollbar py-2"
              role="listbox"
            >
              {grouped.length === 0 && (
                <div
                  className="px-4 py-12 text-center text-sm"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  لا توجد نتائج لـ "{query}"
                </div>
              )}

              {(() => {
                let runningIdx = 0;
                return grouped.map(({ group, items }) => (
                  <div key={group} className="px-2 pb-2">
                    <div
                      className="px-2 py-1.5 text-[9.5px]"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-faint)',
                        letterSpacing: '0.16em',
                      }}
                    >
                      {group}
                    </div>
                    <div className="space-y-px">
                      {items.map((e) => {
                        const idx = runningIdx++;
                        const active = idx === selected;
                        return (
                          <button
                            key={e.id}
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setSelected(idx)}
                            onClick={() => choose(e)}
                            className="w-full flex items-center gap-3 px-2 py-2 text-sm text-start"
                            style={{
                              background: active
                                ? 'var(--paper-hover)'
                                : 'transparent',
                              color: 'var(--ink)',
                              borderRadius: '3px',
                              transition: 'background 0.1s ease',
                            }}
                          >
                            <e.icon
                              className="w-4 h-4 shrink-0"
                              strokeWidth={1.5}
                              style={{
                                color: active
                                  ? 'var(--gold-soft)'
                                  : 'var(--ink-faint)',
                              }}
                            />
                            <span className="flex-1 truncate">{e.label}</span>
                            {e.labelLat && (
                              <span
                                className="text-[10px]"
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--ink-faint)',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {e.labelLat}
                              </span>
                            )}
                            <ArrowRight
                              className="w-3 h-3 shrink-0"
                              strokeWidth={1.5}
                              style={{
                                color: active
                                  ? 'var(--gold-soft)'
                                  : 'var(--ink-ghost)',
                                opacity: active ? 1 : 0.5,
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Footer hints */}
            <div
              className="px-4 py-2 flex items-center justify-between text-[10px]"
              style={{
                borderTop: '1px solid var(--rule)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
                letterSpacing: '0.05em',
              }}
            >
              <span className="flex items-center gap-2">
                <kbd className="kbd">↑</kbd>
                <kbd className="kbd">↓</kbd>
                <span>للتنقل</span>
              </span>
              <span className="flex items-center gap-2">
                <kbd className="kbd">↵</kbd>
                <span>للاختيار</span>
                <span style={{ color: 'var(--ink-ghost)' }}>·</span>
                <kbd className="kbd">?</kbd>
                <span>للاختصارات</span>
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
