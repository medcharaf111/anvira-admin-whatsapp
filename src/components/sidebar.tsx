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
  ScrollText,
  FileText,
  BarChart3,
  LogOut,
  Bell,
  Menu,
  X,
  Crown,
  Users,
  Building2,
  Home,
  DollarSign,
  Shield,
  LifeBuoy,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { ClientType } from '@/lib/client';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: 'alerts' | 'hot_leads';
  /** If set, only render when client_type matches. */
  onlyFor?: ClientType[];
  /** If true, only operators see this item regardless of group. */
  founderOnly?: boolean;
}

interface NavGroup {
  /** Arabic primary label */
  label: string;
  /** Latin secondary (mono caps, English, mirrors landing eyebrows) */
  labelLat: string;
  items: NavItem[];
  onlyFor?: ClientType[];
}

/* ------------------------------------------------------------------ *
 * Workflow grouping — five buckets ordered by daily-use frequency.
 *
 * The brief says: numbers are nav ORDER, never labels. Visual cue for
 * the active page is the gold left-border + bold weight. Groups are
 * separated by a thin rule + ~12px gap.
 * ------------------------------------------------------------------ */

// 1. Daily ops — 80% of operator time. Polished hardest.
const DAILY_OPS: NavGroup = {
  label: 'العمليات اليومية',
  labelLat: 'DAILY OPS',
  items: [
    { href: '/conversations', label: 'المحادثات', icon: MessageSquare },
    { href: '/alerts', label: 'التنبيهات', icon: Bell, badgeKey: 'alerts' },
    {
      href: '/leads',
      label: 'العملاء المحتملين',
      icon: Users,
      badgeKey: 'hot_leads',
      onlyFor: ['real_estate'],
    },
    {
      href: '/viewings',
      label: 'المعاينات',
      icon: Building2,
      onlyFor: ['real_estate'],
    },
    { href: '/calendar', label: 'التقويم', icon: CalendarDays },
    { href: '/bookings', label: 'المواعيد', icon: Calendar },
  ],
};

// 2. Catalog — configured at onboarding, edited weekly.
const CATALOG: NavGroup = {
  label: 'الكتالوج',
  labelLat: 'CATALOG',
  onlyFor: ['real_estate'],
  items: [
    { href: '/properties', label: 'العقارات', icon: Building2 },
    { href: '/projects', label: 'المشاريع', icon: Home },
    { href: '/payment-plans', label: 'خطط السداد', icon: DollarSign },
  ],
};

// 3. Compliance — occasional, regulator-friendly. KYC entry is
// conditionally appended based on per-tenant `kyc_enabled`.
const COMPLIANCE_BASE: NavGroup = {
  label: 'الامتثال',
  labelLat: 'COMPLIANCE',
  onlyFor: ['real_estate'],
  items: [
    { href: '/forms', label: 'النماذج (RERA)', icon: FileText },
    {
      // PDPL Art. 8 deletion requests — operator manages confirms/cancels.
      // Open to RE only since that's where the current pilot tenants sit;
      // can be promoted out of the onlyFor when clinic/salon tenants
      // start needing PDPL surfaces too.
      href: '/data-requests',
      label: 'طلبات حذف البيانات',
      icon: Trash2,
    },
    { href: '/audit', label: 'سجل النشاط', icon: ScrollText },
  ],
};

const KYC_ITEM: NavItem = {
  href: '/kyc',
  // Track D — repositioned per regulatory anchor [[anvira-uae-decree-10-2025]].
  // The module covers both KYC (identity) and AML (sanctions/PEP screening,
  // source of funds), so the broader label is honest. The route stays /kyc
  // to keep deep links + bookmarks working.
  label: 'الامتثال و AML',
  icon: Shield,
  onlyFor: ['real_estate'],
};

// 4. Insights
const INSIGHTS: NavGroup = {
  label: 'التحليلات',
  labelLat: 'INSIGHTS',
  items: [{ href: '/analytics', label: 'التحليلات', icon: BarChart3 }],
};

// 5. Setup — configured once at onboarding, rarely touched after.
const SETUP: NavGroup = {
  label: 'الإعداد',
  labelLat: 'SETUP',
  items: [
    { href: '/knowledge-base', label: 'قاعدة المعرفة', icon: BookOpen },
    { href: '/templates', label: 'الردود الجاهزة', icon: FileText },
    { href: '/settings', label: 'الإعدادات', icon: Settings },
    // Team membership + invitations — surfaced for every client_type
    // since multi-user access is a baseline workspace feature, not a
    // real-estate one. Role-based visibility lives on the page itself
    // (non-owner/admin members get a read-only roster view).
    { href: '/team', label: 'الفريق', icon: Users },
    {
      href: '/recovery',
      label: 'الاسترجاع',
      icon: LifeBuoy,
      onlyFor: ['real_estate'],
    },
  ],
};

// Tools / internal — last group, includes founder-only entries.
const TOOLS: NavGroup = {
  label: 'الأدوات',
  labelLat: 'TOOLS',
  items: [
    { href: '/mock-phone', label: 'هاتف التجربة', icon: Smartphone },
    { href: '/operator', label: 'إدارة العملاء', icon: Crown, founderOnly: true },
  ],
};

function buildGroups(
  clientType: ClientType,
  flags: { kycEnabled: boolean; isOperator: boolean }
): NavGroup[] {
  // Track D — "Compliance & AML" is regulatory (UAE Federal Decree-Law
  // 10/2025), not optional. Surface the nav entry for ALL real-estate
  // tenants regardless of kyc_enabled — the page handles the not-yet-
  // enabled state with an opt-in screen. Hiding it pre-enable was a
  // chicken-and-egg footgun: operators couldn't discover the page to
  // turn it on. flags.kycEnabled is still consulted elsewhere (alerts,
  // dashboard badges) so it stays in the function signature.
  void flags.kycEnabled;
  const compliance: NavGroup = {
    ...COMPLIANCE_BASE,
    items:
      clientType === 'real_estate'
        ? [KYC_ITEM, ...COMPLIANCE_BASE.items]
        : COMPLIANCE_BASE.items,
  };

  const all: NavGroup[] = [DAILY_OPS, CATALOG, compliance, INSIGHTS, SETUP, TOOLS];

  // Filter by client_type at group level
  return all
    .filter((g) => !g.onlyFor || g.onlyFor.includes(clientType))
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => !i.onlyFor || i.onlyFor.includes(clientType))
        .filter((i) => !i.founderOnly || flags.isOperator),
    }))
    // Drop groups that ended up empty after filtering (e.g. Tools with no
    // operator for a non-operator user might still keep mock-phone, so
    // this is a safety net).
    .filter((g) => g.items.length > 0);
}

export function Sidebar({
  alertCount = 0,
  hotLeadCount = 0,
  isOperator = false,
  clientType = 'clinic',
  kycEnabled = false,
}: {
  alertCount?: number;
  hotLeadCount?: number;
  isOperator?: boolean;
  clientType?: ClientType;
  kycEnabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
  }

  const groups = buildGroups(clientType, { kycEnabled, isOperator });

  const navContent = (
    <>
      {/* Wordmark */}
      <div className="px-5 py-6" style={{ borderBottom: '1px solid var(--rule)' }}>
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--gold-soft)' }}
          />
          <div
            className="text-[15px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
          >
            أنفيرا
          </div>
          <span
            className="text-[10px]"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.12em',
            }}
          >
            · OPERATOR
          </span>
        </div>
      </div>

      {/* Nav groups — visually separated by thin rule + 12px gap */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto no-scrollbar">
        {groups.map((group, gi) => (
          <div
            key={group.labelLat}
            className={gi > 0 ? 'pt-3 mt-3' : ''}
            style={
              gi > 0
                ? { borderTop: '1px solid var(--rule-soft)' }
                : undefined
            }
          >
            <div
              className="px-3 mb-2 text-[9.5px] flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              <span>{group.labelLat}</span>
            </div>
            <div className="space-y-px">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                let count = 0;
                if (item.badgeKey === 'alerts') count = alertCount;
                else if (item.badgeKey === 'hot_leads') count = hotLeadCount;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="relative flex items-center gap-3 px-3 py-2 text-sm group"
                    style={{
                      color: active ? 'var(--ink)' : 'var(--ink-soft)',
                      fontWeight: active ? 600 : 400,
                      background: active ? 'var(--paper-hover)' : 'transparent',
                      borderRadius: '3px',
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                    aria-current={active ? 'page' : undefined}
                  >
                    {/* Active indicator — gold left-bar (RTL: right edge) */}
                    {active && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute top-1/2 -translate-y-1/2 w-[2px] h-6"
                        style={{
                          insetInlineEnd: '-12px',
                          background: 'var(--gold-soft)',
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}

                    <item.icon
                      className="w-4 h-4 shrink-0"
                      strokeWidth={active ? 1.75 : 1.5}
                      style={{ color: active ? 'var(--gold-soft)' : 'currentColor' }}
                    />

                    <span className="flex-1 truncate">{item.label}</span>

                    {count > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="min-w-[18px] h-[18px] px-1.5 flex items-center justify-center text-[10px] font-medium tabular"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          background:
                            item.badgeKey === 'alerts'
                              ? 'var(--signal)'
                              : 'var(--gold)',
                          color: 'var(--paper)',
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

      {/* Footer — keyboard hint + signout */}
      <div
        className="px-3 py-3"
        style={{ borderTop: '1px solid var(--rule)' }}
      >
        <button
          type="button"
          onClick={() => {
            // Open command palette via custom event — listened to in
            // <CommandPalette> mounted in the layout.
            window.dispatchEvent(new CustomEvent('anvira:open-command-palette'));
            setMobileOpen(false);
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] mb-1"
          style={{
            color: 'var(--ink-faint)',
            borderRadius: '3px',
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
          }}
        >
          <span className="flex items-center gap-2">
            <span style={{ fontFamily: 'var(--font-mono)' }}>اضغط للبحث</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors"
          style={{
            color: 'var(--ink-soft)',
            borderRadius: '3px',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--paper-hover)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'transparent')
          }
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
            style={{ background: 'var(--gold-soft)' }}
          />
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            أنفيرا
          </span>
        </div>
        <div className="flex items-center gap-3">
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
              style={{
                background: 'color-mix(in srgb, var(--paper-sink) 80%, transparent)',
              }}
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
