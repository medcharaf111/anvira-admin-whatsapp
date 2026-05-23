'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { ClientType } from '@/lib/client';

/* ------------------------------------------------------------------ *
 * KeyboardShortcuts — global hotkey layer.
 *
 * - `g c` → /conversations
 * - `g l` → /leads          (real-estate only)
 * - `g a` → /alerts
 * - `g k` → /kyc            (real-estate, only useful when kyc_enabled)
 * - `g p` → /properties
 * - `g s` → /settings
 * - `?`   → toggle the shortcut overlay
 * - `Esc` → close overlay (other modals own their Esc)
 *
 * The two-key `g <x>` chord is implemented with a 1200ms window after
 * `g` is pressed; pressing `g` twice resets the window.
 *
 * Important: ALL shortcuts no-op when focus is inside an input/textarea
 * or contentEditable element. The Cmd/Ctrl+K palette is handled in its
 * own component to keep the chord window separate.
 * ------------------------------------------------------------------ */

const SHORTCUT_TABLE: Array<{
  keys: string[];
  description: string;
  descriptionLat: string;
}> = [
  { keys: ['⌘', 'K'], description: 'فتح لوحة الأوامر', descriptionLat: 'Open command palette' },
  { keys: ['/'], description: 'فتح البحث', descriptionLat: 'Open search' },
  { keys: ['G', 'C'], description: 'المحادثات', descriptionLat: 'Conversations' },
  { keys: ['G', 'A'], description: 'التنبيهات', descriptionLat: 'Alerts' },
  { keys: ['G', 'L'], description: 'العملاء المحتملين', descriptionLat: 'Leads (RE)' },
  { keys: ['G', 'V'], description: 'المعاينات', descriptionLat: 'Viewings (RE)' },
  { keys: ['G', 'P'], description: 'العقارات', descriptionLat: 'Properties (RE)' },
  { keys: ['G', 'K'], description: 'الامتثال و AML', descriptionLat: 'Compliance & AML (RE)' },
  { keys: ['G', 'S'], description: 'الإعدادات', descriptionLat: 'Settings' },
  { keys: ['G', 'N'], description: 'قاعدة المعرفة', descriptionLat: 'Knowledge Base' },
  { keys: ['N'], description: 'جديد (سياقي)', descriptionLat: 'New (contextual)' },
  { keys: ['ESC'], description: 'إغلاق', descriptionLat: 'Close drawer / modal' },
  { keys: ['?'], description: 'عرض هذه القائمة', descriptionLat: 'Show this overlay' },
];

export function KeyboardShortcuts({
  clientType,
}: {
  clientType: ClientType;
}) {
  const router = useRouter();
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    let gWindow: ReturnType<typeof setTimeout> | null = null;
    let waitingForChord = false;
    let chordKey: 'g' | null = null;

    function clearChord() {
      waitingForChord = false;
      chordKey = null;
      if (gWindow) {
        clearTimeout(gWindow);
        gWindow = null;
      }
    }

    function isTyping() {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function go(href: string) {
      // Skip RE-only pages for non-RE tenants
      const reOnly = ['/leads', '/viewings', '/properties', '/projects', '/payment-plans', '/forms', '/kyc'];
      if (reOnly.includes(href) && clientType !== 'real_estate') return;
      router.push(href);
    }

    function onKey(ev: KeyboardEvent) {
      // Always-on: '?' opens overlay (Shift+/ on most layouts)
      if (ev.key === '?' && !isTyping()) {
        ev.preventDefault();
        setOverlayOpen((o) => !o);
        return;
      }
      if (ev.key === 'Escape' && overlayOpen) {
        ev.preventDefault();
        setOverlayOpen(false);
        return;
      }
      if (isTyping()) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

      const k = ev.key.toLowerCase();

      // Chord start
      if (k === 'g' && !waitingForChord) {
        ev.preventDefault();
        waitingForChord = true;
        chordKey = 'g';
        gWindow = setTimeout(clearChord, 1200);
        return;
      }

      // Chord follow-up
      if (waitingForChord && chordKey === 'g') {
        ev.preventDefault();
        switch (k) {
          case 'c':
            go('/conversations');
            break;
          case 'a':
            go('/alerts');
            break;
          case 'l':
            go('/leads');
            break;
          case 'v':
            go('/viewings');
            break;
          case 'p':
            go('/properties');
            break;
          case 'k':
            go('/kyc');
            break;
          case 's':
            go('/settings');
            break;
          case 'n':
            go('/knowledge-base');
            break;
        }
        clearChord();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearChord();
    };
  }, [router, clientType, overlayOpen]);

  return (
    <AnimatePresence>
      {overlayOpen && (
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
            onClick={() => setOverlayOpen(false)}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[12vh] z-[101] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2"
            role="dialog"
            aria-modal="true"
            aria-label="اختصارات لوحة المفاتيح"
            style={{
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              borderRadius: '6px',
              boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div>
                <div
                  className="text-[10px]"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                    letterSpacing: '0.16em',
                  }}
                >
                  KEYBOARD SHORTCUTS
                </div>
                <h2
                  className="text-base mt-0.5"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  اختصارات لوحة المفاتيح
                </h2>
              </div>
              <kbd className="kbd">ESC</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto no-scrollbar px-5 py-4">
              <ul className="space-y-2">
                {SHORTCUT_TABLE.map((row) => (
                  <li
                    key={row.descriptionLat}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 text-sm py-1"
                  >
                    <div>
                      <span style={{ color: 'var(--ink)' }}>{row.description}</span>
                      <span
                        className="ms-2 text-[11px]"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--ink-faint)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {row.descriptionLat}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {row.keys.map((k) => (
                        <kbd key={k} className="kbd">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
