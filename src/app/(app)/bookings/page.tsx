import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { Calendar } from 'lucide-react';
import { formatViewingDate } from '@/lib/dates';
import type { CalendarMode } from '@/lib/client';

export const dynamic = 'force-dynamic';

interface Booking {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  service: string | null;
  starts_at: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  booking_type: 'appointment' | 'viewing' | null;
  viewing_mode: 'showroom' | 'site' | 'virtual' | null;
}

export default async function BookingsPage() {
  const client = await requireCurrentClient();
  const isRE = client.client_type === 'real_estate';
  const supabase = await createClient();
  const { data } = await supabase
    .from('bookings')
    .select('id, customer_phone, customer_name, service, starts_at, status, booking_type, viewing_mode')
    .eq('client_id', client.id)
    .order('starts_at', { ascending: true });
  const bookings = (data ?? []) as Booking[];

  const groups = {
    confirmed: bookings.filter((b) => b.status === 'confirmed'),
    pending: bookings.filter((b) => b.status === 'pending'),
    cancelled: bookings.filter((b) => b.status === 'cancelled'),
  };

  // Real-estate flips terminology: "viewings" instead of "appointments".
  // The underlying table is identical — only the copy changes so the
  // operator sees the same words their customers use.
  const labels = isRE
    ? {
        eyebrow: '04 / المعاينات',
        title: 'المعاينات المحجوزة',
        subtitle: (total: number, ok: number, pend: number) =>
          `${total} معاينة · ${ok} مؤكّدة · ${pend} في الانتظار`,
        empty: 'لا توجد معاينات بعد.',
        confirmed: 'مؤكّدة',
        pending: 'في الانتظار',
        cancelled: 'ملغاة',
      }
    : {
        eyebrow: '04 / المواعيد',
        title: 'المواعيد المحجوزة',
        subtitle: (total: number, ok: number, pend: number) =>
          `${total} موعد · ${ok} مؤكّد · ${pend} في الانتظار`,
        empty: 'لا توجد مواعيد بعد.',
        confirmed: 'مؤكّدة',
        pending: 'في الانتظار',
        cancelled: 'ملغاة',
      };

  return (
    <div>
      <RealtimeRefresh
        subs={[{ table: 'bookings', filter: `client_id=eq.${client.id}` }]}
      />
      <PageHeader
        eyebrow={labels.eyebrow}
        title={labels.title}
        subtitle={labels.subtitle(bookings.length, groups.confirmed.length, groups.pending.length)}
      />

      {bookings.length === 0 ? (
        <div
          className="py-20 text-center panel"
          style={{ borderStyle: 'dashed' }}
        >
          <Calendar
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            {labels.empty}
          </p>
        </div>
      ) : (
        <>
          <Section title={labels.confirmed} items={groups.confirmed} severity="success" timezone={client.business_timezone} isRE={isRE} calendarMode={client.calendar_mode} />
          <Section title={labels.pending} items={groups.pending} severity="warn" timezone={client.business_timezone} isRE={isRE} calendarMode={client.calendar_mode} />
          <Section title={labels.cancelled} items={groups.cancelled} severity="idle" timezone={client.business_timezone} isRE={isRE} calendarMode={client.calendar_mode} />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  severity,
  timezone,
  isRE,
  calendarMode,
}: {
  title: string;
  items: Booking[];
  severity: 'success' | 'warn' | 'idle';
  timezone: string;
  isRE: boolean;
  calendarMode: CalendarMode;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-4">
        <span className="eyebrow">
          {title} · {items.length.toString().padStart(2, '0')}
        </span>
        <span className="h-px flex-1" style={{ background: 'var(--rule)' }} />
      </div>

      <div>
        {items.map((b) => (
          <div
            key={b.id}
            className="grid grid-cols-[1fr_auto_auto] gap-5 items-center py-4 px-4 row-hover"
            style={{ borderBottom: '1px solid var(--rule)' }}
          >
            {/* Customer */}
            <div className="min-w-0">
              <div
                className="text-sm font-medium truncate"
                style={{ color: 'var(--ink)' }}
              >
                {b.customer_name || 'بدون اسم'}
              </div>
              <div
                className="text-[11px] mt-0.5 tabular truncate"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                dir="ltr"
              >
                {b.customer_phone}
              </div>
            </div>

            {/* Service / viewing mode */}
            <div className="text-xs max-w-xs" style={{ color: 'var(--ink-soft)' }}>
              {b.service ?? (isRE && b.booking_type === 'viewing' ? 'معاينة' : 'موعد')}
              {isRE && b.viewing_mode && (
                <span
                  className="ms-2 text-[10px] px-1.5 py-0.5"
                  style={{
                    background: 'var(--paper-sink)',
                    border: '1px solid var(--rule)',
                    borderRadius: '2px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                  }}
                >
                  {b.viewing_mode}
                </span>
              )}
            </div>

            {/* Date + status */}
            <div className="text-left shrink-0 min-w-[14rem]">
              <div
                className="text-sm tabular"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
              >
                {formatViewingDate(b.starts_at, {
                  mode: calendarMode,
                  lang: 'ar',
                  timeZone: timezone,
                  withTime: true,
                  withWeekday: true,
                })}
              </div>
              <div className="mt-1.5">
                <span
                  className={`pill pill-${severity === 'success' ? 'success' : severity === 'warn' ? 'warn' : 'idle'}`}
                >
                  <span className="pill-dot" />
                  <span>
                    {severity === 'success' ? 'مؤكّد' : severity === 'warn' ? 'بالانتظار' : 'ملغى'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
