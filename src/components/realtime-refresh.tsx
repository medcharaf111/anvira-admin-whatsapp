'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Subscription {
  /** Postgres table name (e.g. 'conversations', 'messages', 'handoffs'). */
  table: string;
  /**
   * Optional Supabase realtime filter (e.g. 'client_id=eq.<uuid>').
   * Realtime sends ALL events when filter is empty, so always set it for
   * tenant-scoped data to avoid leaking other tenants' rows over the channel.
   */
  filter?: string;
  /** Defaults to all events ('*'). */
  events?: ('INSERT' | 'UPDATE' | 'DELETE' | '*')[];
}

/**
 * Mounts Supabase realtime subscriptions and calls router.refresh()
 * whenever a matching row event arrives. Drop into any server-rendered
 * page to make it auto-update without a manual reload.
 *
 * Renders nothing — purely a side-effect component.
 */
export function RealtimeRefresh({ subs }: { subs: Subscription[] }) {
  const router = useRouter();

  useEffect(() => {
    if (subs.length === 0) return;
    const supabase = createClient();

    // Coalesce rapid bursts (e.g. inbound + outbound message in <500ms)
    // into a single refresh so we don't hammer Next's server-component fetch.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    const channels = subs.map((sub, i) => {
      const events = sub.events ?? ['*'];
      const channelName = `rt:${sub.table}:${i}:${Date.now()}:${Math.random()}`;
      const ch = supabase.channel(channelName);
      for (const ev of events) {
        ch.on(
          'postgres_changes' as never,
          { event: ev, schema: 'public', table: sub.table, filter: sub.filter },
          () => refreshSoon()
        );
      }
      ch.subscribe();
      return ch;
    });

    return () => {
      if (timer) clearTimeout(timer);
      for (const ch of channels) supabase.removeChannel(ch);
    };
  }, [subs, router]);

  return null;
}
