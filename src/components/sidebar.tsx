'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  BookOpen,
  Calendar,
  CalendarDays,
  Settings,
  Smartphone,
  LogOut,
  Bell,
  Menu,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/theme-toggle';

const NAV_GROUPS = [
  {
    label: 'العمليات',
    items: [
      { href: '/conversations', label: 'المحادثات', icon: MessageSquare, num: '01' },
      { href: '/alerts', label: 'التنبيهات', icon: Bell, badgeKey: 'alerts' as const, num: '02' },
      { href: '/calendar', label: 'التقويم', icon: CalendarDays, num: '03' },
      { href: '/bookings', label: 'المواعيد', icon: Calendar, num: '04' },
    ],
  },
  {
    label: 'الإعداد',
    items: [
      { href: '/knowledge-base', label: 'قاعدة المعرفة', icon: BookOpen, num: '05' },
      { href: '/settings', label: 'الإعدادات', icon: Settings, num: '06' },
      { href: '/mock-phone', label: 'هاتف التجربة', icon: Smartphone, num: '07' },
    ],
  },
];

export function Sidebar({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
  }

  const navContent = (
    <>
      {/* Wordmark */}
      <div className="px-5 py-6" style={{ borderBottom: '1px solid var(--rule)' }}>
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--primary-glow)' }}
          />
          <div
            className="text-[15px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
          >
            أنفيرا
          </div>
          <span
            className="text-[11px]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', letterSpacing: '0.08em' }}
          >
            · OPERATOR
          </span>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-6 space-y-7 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div
              className="px-3 mb-3 text-[10px]"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const count = 'badgeKey' in item && item.badgeKey === 'alerts' ? alertCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="relative flex items-center gap-3 px-3 py-2 text-sm group"
                    style={{
                      color: active ? 'var(--ink)' : 'var(--ink-soft)',
                      background: active ? 'var(--paper-hover)' : 'transparent',
                      borderRadius: '3px',
                      transition: 'all 0.15s ease',
                    }}
                    aria-current={active ? 'page' : undefined}
                  >
                    {/* Active indicator — left bar (RTL: right) */}
                    {active && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute top-1/2 -translate-y-1/2 w-[2px] h-6"
                        style={{
                          insetInlineEnd: '-12px',
                          background: 'var(--primary-glow)',
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}

                    <span
                      className="text-[10px] tabular shrink-0"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: active ? 'var(--primary-glow)' : 'var(--ink-faint)',
                        width: '1.25rem',
                      }}
                    >
                      {item.num}
                    </span>

                    <item.icon
                      className="w-4 h-4 shrink-0"
                      strokeWidth={1.5}
                      style={{ color: active ? 'var(--primary-glow)' : 'currentColor' }}
                    />

                    <span className="flex-1 truncate">{item.label}</span>

                    {count > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="min-w-[20px] h-[20px] px-1.5 flex items-center justify-center text-[10px] font-medium tabular"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          background: 'var(--signal)',
                          color: 'var(--ink)',
                          borderRadius: '2px',
                        }}
                      >
                        {count}
                      </motion.span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — signout */}
      <div className="p-3" style={{ borderTop: '1px solid var(--rule)' }}>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors"
          style={{
            color: 'var(--ink-soft)',
            borderRadius: '3px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-60 shrink-0 flex-col"
        style={{
          borderInlineStart: '1px solid var(--rule)',
          background: 'var(--paper-sink)',
        }}
      >
        {navContent}
      </aside>

      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-50 h-12 flex items-center justify-between px-4"
        style={{
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--primary-glow)' }}
          />
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            أنفيرا
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {alertCount > 0 && (
            <span
              className="min-w-[18px] h-[18px] px-1 text-[10px] flex items-center justify-center tabular"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--signal)',
                color: 'var(--paper)',
                borderRadius: '2px',
              }}
            >
              {alertCount}
            </span>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center"
            style={{ color: 'var(--ink)' }}
            aria-label="القائمة"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-50"
              style={{ background: 'color-mix(in srgb, var(--paper-sink) 80%, transparent)' }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="md:hidden fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col"
              style={{
                background: 'var(--paper-sink)',
                borderInlineStart: '1px solid var(--rule)',
              }}
            >
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
