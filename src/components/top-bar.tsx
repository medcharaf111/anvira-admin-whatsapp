'use client';
import { Search } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { TopBarClock } from '@/components/top-bar-clock';
import type { Transport } from '@/lib/client';

/**
 * Persistent top bar — visible on every (app) page.
 *
 * Layout (desktop, RTL):
 *   [ tenant name · sandbox · clock · transport pill ]   [ search · theme toggle ]
 *
 * The "search" element is a click-bait that fires the
 * `anvira:open-command-palette` custom event — same event the sidebar's
 * footer button dispatches — keeping a single source of truth for how the
 * palette opens (Cmd/Ctrl+K hotkey, sidebar button, top-bar input).
 */
export function TopBar({
  clientName,
  isSandbox,
  timezone,
  transport,
}: {
  clientName: string;
  isSandbox: boolean;
  timezone: string;
  transport: Transport;
}) {
  return (
    <div
      className="hidden md:flex sticky top-0 z-40 items-center gap-4 px-12 h-14"
      style={{
        background: 'color-mix(in srgb, var(--paper) 88%, transparent)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {/* Tenant context — left in LTR, right in RTL */}
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="text-[11px] font-medium truncate"
          style={{ color: 'var(--ink)', letterSpacing: '-0.005em' }}
        >
          {clientName}
        </span>
        {isSandbox && (
          <span className="pill pill-warn">
            <span className="pill-dot" />
            <span>SANDBOX</span>
          </span>
        )}
        <span style={{ color: 'var(--ink-ghost)' }}>·</span>
        <TopBarClock timezone={timezone} />
        <span style={{ color: 'var(--ink-ghost)' }}>·</span>
        <TransportPill transport={transport} />
      </div>

      {/* Right: search trigger + theme */}
      <div className="ms-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent('anvira:open-command-palette'))
          }
          className="hidden lg:flex items-center gap-3 h-9 ps-3 pe-2 text-[12px]"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            color: 'var(--ink-faint)',
            borderRadius: '3px',
            minWidth: '220px',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = 'var(--ink-faint)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = 'var(--rule)')
          }
          aria-label="فتح البحث"
        >
          <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="flex-1 text-start">ابحث في أنفيرا...</span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

function TransportPill({ transport }: { transport: Transport }) {
  const meta: Record<
    Transport,
    { label: string; variant: 'success' | 'gold' | 'warn' }
  > = {
    cloud_api: { label: 'CLOUD API', variant: 'success' },
    evolution: { label: 'EVOLUTION', variant: 'gold' },
    mock: { label: 'MOCK', variant: 'warn' },
  };
  const m = meta[transport];
  return (
    <span className={`pill pill-${m.variant}`}>
      <span className="pill-dot" />
      <span>{m.label}</span>
    </span>
  );
}
