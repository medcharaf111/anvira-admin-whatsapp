import {
  Inbox,
  Send,
  Users,
  Calendar,
  Bell,
  TrendingUp,
} from 'lucide-react';

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
  icon: 'inbox' | 'send' | 'users' | 'calendar' | 'bell' | 'percent';
  accent?: boolean;
}

const ICON_MAP = {
  inbox: Inbox,
  send: Send,
  users: Users,
  calendar: Calendar,
  bell: Bell,
  percent: TrendingUp,
};

export function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px mb-10"
      style={{ background: 'var(--rule)' }}
    >
      {items.map((k) => {
        const Icon = ICON_MAP[k.icon];
        return (
          <div
            key={k.label}
            className="p-5"
            style={{ background: 'var(--paper-lift)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <Icon
                className="w-3.5 h-3.5"
                strokeWidth={1.5}
                style={{
                  color: k.accent ? 'var(--primary-glow)' : 'var(--ink-faint)',
                }}
              />
              <span
                className="text-[9px] uppercase tracking-widest"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              >
                7D
              </span>
            </div>
            <div
              className="tabular leading-none"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 400,
                color: k.accent ? 'var(--primary-glow)' : 'var(--ink)',
                letterSpacing: '-0.02em',
              }}
            >
              {k.value}
            </div>
            <div
              className="mt-2 text-[10px] uppercase tracking-widest"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              {k.label}
            </div>
            {k.hint && (
              <div
                className="mt-1.5 text-[10px]"
                style={{ color: 'var(--ink-faint)' }}
              >
                {k.hint}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
