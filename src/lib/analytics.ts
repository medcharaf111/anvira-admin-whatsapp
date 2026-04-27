import { createClient } from '@/lib/supabase/server';

export interface AnalyticsSummary {
  // Headline KPIs (last 7 days)
  messagesIn: number;
  messagesOut: number;
  uniqueCustomers: number;
  bookings: number;
  handoffs: number;
  // Trends (last 30 days, grouped by day)
  messagesByDay: { date: string; in: number; out: number }[];
  bookingsByDay: { date: string; count: number }[];
  // Breakdown
  handoffsByReason: { reason: string; count: number }[];
  // Bot performance ratios
  handoffRate: number; // 0-1
  bookingConversion: number; // 0-1 (bookings / new convos)
}

function dayKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function emptyDayMap(days: number): Map<string, { in: number; out: number }> {
  const m = new Map<string, { in: number; out: number }>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60_000);
    m.set(dayKey(d), { in: 0, out: 0 });
  }
  return m;
}

function emptyBookingsMap(days: number): Map<string, number> {
  const m = new Map<string, number>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60_000);
    m.set(dayKey(d), 0);
  }
  return m;
}

export async function loadAnalytics(clientId: string): Promise<AnalyticsSummary> {
  const supabase = await createClient();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

  const [msgRes, bookRes, convRes, hoffRes, hoff7Res, msg7Res] = await Promise.all([
    // Messages last 30 days (for trend)
    supabase
      .from('messages')
      .select('direction, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since30)
      .limit(50_000),
    // Bookings last 30 days (for trend + KPI)
    supabase
      .from('bookings')
      .select('created_at, status')
      .eq('client_id', clientId)
      .gte('created_at', since30)
      .limit(10_000),
    // Conversations last 7 days (for unique customers KPI + conversion denominator)
    supabase
      .from('conversations')
      .select('id, customer_phone, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since7)
      .limit(10_000),
    // Handoffs last 30 days (for breakdown)
    supabase
      .from('handoffs')
      .select('reason, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since30)
      .limit(10_000),
    // Handoffs last 7 days (for KPI count)
    supabase
      .from('handoffs')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', since7),
    // Messages last 7 days (for KPI count, separate counts by direction)
    supabase
      .from('messages')
      .select('direction')
      .eq('client_id', clientId)
      .gte('created_at', since7)
      .limit(50_000),
  ]);

  const messages = msgRes.data ?? [];
  const bookings = bookRes.data ?? [];
  const convos = convRes.data ?? [];
  const handoffs = hoffRes.data ?? [];

  // ─── 30-day daily series ────────────────────────────────────
  const msgMap = emptyDayMap(30);
  for (const m of messages) {
    const k = dayKey(m.created_at);
    const bucket = msgMap.get(k);
    if (!bucket) continue;
    if (m.direction === 'inbound') bucket.in++;
    else bucket.out++;
  }
  const messagesByDay = Array.from(msgMap.entries()).map(([date, v]) => ({
    date,
    ...v,
  }));

  const bookMap = emptyBookingsMap(30);
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const k = dayKey(b.created_at);
    if (bookMap.has(k)) bookMap.set(k, (bookMap.get(k) ?? 0) + 1);
  }
  const bookingsByDay = Array.from(bookMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  // ─── 7-day KPIs ─────────────────────────────────────────────
  const msg7 = msg7Res.data ?? [];
  const messagesIn = msg7.filter((m) => m.direction === 'inbound').length;
  const messagesOut = msg7.filter((m) => m.direction === 'outbound').length;

  const uniqueCustomers = new Set(convos.map((c) => c.customer_phone)).size;
  const bookings7 = bookings.filter(
    (b) =>
      new Date(b.created_at).getTime() >= Date.now() - 7 * 24 * 60 * 60_000 &&
      b.status !== 'cancelled'
  ).length;
  const handoffs7 = hoff7Res.count ?? 0;

  // ─── Handoff breakdown (30 days) ─────────────────────────────
  const reasonMap = new Map<string, number>();
  for (const h of handoffs) {
    reasonMap.set(h.reason, (reasonMap.get(h.reason) ?? 0) + 1);
  }
  const handoffsByReason = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // ─── Ratios ─────────────────────────────────────────────────
  const handoffRate =
    messagesIn === 0 ? 0 : Math.min(1, handoffs7 / messagesIn);
  const bookingConversion =
    convos.length === 0 ? 0 : Math.min(1, bookings7 / convos.length);

  return {
    messagesIn,
    messagesOut,
    uniqueCustomers,
    bookings: bookings7,
    handoffs: handoffs7,
    messagesByDay,
    bookingsByDay,
    handoffsByReason,
    handoffRate,
    bookingConversion,
  };
}
