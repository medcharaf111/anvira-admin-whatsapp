import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { Calendar } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Booking {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  service: string | null;
  starts_at: string;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export default async function BookingsPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('client_id', client.id)
    .order('starts_at', { ascending: true });
  const bookings = (data ?? []) as Booking[];

  const groups = {
    confirmed: bookings.filter((b) => b.status === 'confirmed'),
    pending: bookings.filter((b) => b.status === 'pending'),
    cancelled: bookings.filter((b) => b.status === 'cancelled'),
  };

  return (
    <div>
      <PageHeader
        eyebrow="03 / المواعيد"
        title="المواعيد المحجوزة"
        subtitle={`${bookings.length} موعد · ${groups.confirmed.length} مؤكّد · ${groups.pending.length} في الانتظار`}
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
            لا توجد مواعيد بعد.
          </p>
        </div>
      ) : (
        <>
          <Section title="مؤكّدة" items={groups.confirmed} severity="success" />
          <Section title="في الانتظار" items={groups.pending} severity="warn" />
          <Section title="ملغاة" items={groups.cancelled} severity="idle" />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  severity,
}: {
  title: string;
  items: Booking[];
  severity: 'success' | 'warn' | 'idle';
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

            {/* Service */}
            <div className="text-xs max-w-xs" style={{ color: 'var(--ink-soft)' }}>
              {b.service ?? 'موعد'}
            </div>

            {/* Date + status */}
            <div className="text-left shrink-0 min-w-[14rem]">
              <div
                className="text-sm tabular"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
              >
                {new Date(b.starts_at).toLocaleString('ar-AE', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
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
