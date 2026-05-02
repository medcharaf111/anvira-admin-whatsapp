'use client';
import { useEffect, useState } from 'react';
import { timezoneLabel } from '@/lib/timezones';

/**
 * Shows the client's current local time in the top bar so the operator
 * never misreads bookings displayed in this client's timezone. Updates
 * once per minute (the second granularity isn't useful for scheduling).
 */
export function TopBarClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Refresh on the next minute boundary, then every 60s. Aligning to the
    // minute boundary means '4:32' flips to '4:33' the moment the client's
    // clock would, not 60s after page load.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const aligned = setTimeout(() => {
      setNow(new Date());
      const interval = setInterval(() => setNow(new Date()), 60_000);
      // Cleanup the interval when the next render unmounts the timeout
      // (handled by the outer return below)
      (aligned as any)._interval = interval;
    }, msToNextMinute);

    return () => {
      clearTimeout(aligned);
      const interval = (aligned as any)._interval;
      if (interval) clearInterval(interval);
    };
  }, []);

  const time = now.toLocaleTimeString('ar-AE', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <span
      className="text-[11px] flex items-center gap-2"
      style={{
        fontFamily: 'var(--font-mono)',
        color: 'var(--ink-faint)',
        letterSpacing: '0.04em',
      }}
      title={`${timezoneLabel(timezone)} (${timezone})`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: 'var(--primary-glow)' }}
      />
      <span className="tabular">{time}</span>
      <span style={{ color: 'var(--ink-ghost)' }}>·</span>
      <span>{timezoneLabel(timezone)}</span>
    </span>
  );
}
