'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, Plus, X, Loader2, Trash2, Wand2,
} from 'lucide-react';

interface BookingEvent {
  id: string;
  kind: 'booking';
  customer_name: string | null;
  customer_phone: string | null;
  service: string | null;
  starts_at: string;
  ends_at: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  google_event_id: string | null;
}

interface ExternalEvent {
  id: string;
  kind: 'external';
  summary: string;
  starts_at: string;
  ends_at: string;
}

type CalEvent = BookingEvent | ExternalEvent;

const HOUR_HEIGHT = 56;       // px per hour
const HOURS_VISIBLE = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // 8 AM – 8 PM
const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay()); // Sunday start
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isoLocal(d: Date): string {
  // To "YYYY-MM-DDTHH:mm" suitable for datetime-local input
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarView() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [createSlot, setCreateSlot] = useState<Date | null>(null);
  const [openEvent, setOpenEvent] = useState<CalEvent | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileNote, setReconcileNote] = useState<string | null>(null);

  async function reconcile() {
    if (reconciling) return;
    if (!confirm('سيتم حذف أحداث Google Calendar المرتبطة بمواعيد ملغاة. متابعة؟')) return;
    setReconciling(true);
    setReconcileNote(null);
    try {
      const res = await fetch('/api/calendar/reconcile', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'reconcile_failed');
      const { examined, cleaned, failed } = j;
      setReconcileNote(
        failed > 0
          ? `فحص ${examined} · حُذف ${cleaned} · فشل ${failed}`
          : cleaned > 0
          ? `حُذف ${cleaned} حدث متبقٍّ من Google Calendar`
          : 'لا أحداث متبقّية. الجدول نظيف.'
      );
      fetchEvents();
    } catch (err: any) {
      setReconcileNote(`خطأ: ${err?.message ?? 'reconcile_failed'}`);
    } finally {
      setReconciling(false);
      setTimeout(() => setReconcileNote(null), 6000);
    }
  }

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Stable timestamp keys avoid the "new Date every render" infinite-loop trap
  const weekStartTs = weekStart.getTime();

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(weekStartTs);
      const end = addDays(start, 7);
      const url = `/api/calendar/events?from=${start.toISOString()}&to=${end.toISOString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch_failed');
      const data = await res.json();
      const merged: CalEvent[] = [...(data.bookings ?? []), ...(data.external ?? [])];
      setEvents(merged);
    } catch (err) {
      console.error('[calendar] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [weekStartTs]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function eventsForDay(day: Date): CalEvent[] {
    return events.filter((e) => sameYMD(new Date(e.starts_at), day));
  }

  return (
    <div>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between mb-6 pb-4"
        style={{ borderBottom: '1px solid var(--rule)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="btn-ghost h-9 w-9 p-0"
            aria-label="الأسبوع السابق"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="btn-ghost h-9 px-4 text-xs"
          >
            هذا الأسبوع
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="btn-ghost h-9 w-9 p-0"
            aria-label="الأسبوع القادم"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div
          className="display-ar text-lg"
          style={{ color: 'var(--ink)' }}
        >
          {weekStart.toLocaleDateString('ar-AE', { day: 'numeric', month: 'long' })}{' '}
          —{' '}
          {addDays(weekStart, 6).toLocaleDateString('ar-AE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reconcile}
            disabled={reconciling}
            className="btn-ghost h-9 gap-2 text-xs"
            title="حذف أحداث Google Calendar المرتبطة بمواعيد ملغاة"
          >
            {reconciling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            <span>تنظيف الجدول</span>
          </button>
          <button
            onClick={() => {
              const now = new Date();
              now.setMinutes(0, 0, 0);
              now.setHours(now.getHours() + 1);
              setCreateSlot(now);
            }}
            className="btn-primary h-9 gap-2 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>موعد جديد</span>
          </button>
        </div>
      </div>

      {reconcileNote && (
        <div
          className="mb-4 px-4 py-2.5 text-xs"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            color: 'var(--ink)',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {reconcileNote}
        </div>
      )}

      {/* Week grid */}
      <div className="relative" style={{ border: '1px solid var(--rule)', borderRadius: '3px' }}>
        {/* Day headers */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: '60px repeat(7, 1fr)',
            background: 'var(--paper-lift)',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <div />
          {days.map((d, i) => {
            const isToday = sameYMD(d, new Date());
            return (
              <div
                key={i}
                className="px-3 py-3 text-center"
                style={{
                  borderInlineStart: i > 0 ? '1px solid var(--rule)' : 'none',
                  background: isToday ? 'var(--paper-hover)' : 'transparent',
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-widest"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                >
                  {ARABIC_DAYS[d.getDay()]}
                </div>
                <div
                  className="tabular text-lg mt-1"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 400,
                    color: isToday ? 'var(--primary-glow)' : 'var(--ink)',
                  }}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid — single CSS grid keeps time column + days aligned with header */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: '60px repeat(7, 1fr)',
            height: HOURS_VISIBLE.length * HOUR_HEIGHT,
          }}
        >
          {/* Time column */}
          <div
            className="relative"
            style={{ borderInlineEnd: '1px solid var(--rule)' }}
          >
            {HOURS_VISIBLE.map((h, i) => (
              <div
                key={h}
                className="text-[10px] tabular text-center pt-1"
                style={{
                  height: HOUR_HEIGHT,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-faint)',
                  borderTop: i === 0 ? 'none' : '1px solid var(--rule-soft)',
                }}
              >
                {h.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => (
            <DayColumn
              key={di}
              day={day}
              events={eventsForDay(day)}
              onSlotClick={(date) => setCreateSlot(date)}
              onEventClick={(ev) => setOpenEvent(ev)}
              showLeftBorder={di > 0}
            />
          ))}
        </div>

        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--paper) 70%, transparent)' }}
          >
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--primary-glow)' }} />
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {createSlot && (
          <CreateBookingModal
            initialStart={createSlot}
            onClose={() => setCreateSlot(null)}
            onSaved={() => {
              setCreateSlot(null);
              fetchEvents();
            }}
          />
        )}
        {openEvent && (
          <EventDetailModal
            event={openEvent}
            onClose={() => setOpenEvent(null)}
            onDeleted={() => {
              setOpenEvent(null);
              fetchEvents();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DayColumn({
  day,
  events,
  onSlotClick,
  onEventClick,
  showLeftBorder,
}: {
  day: Date;
  events: CalEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (ev: CalEvent) => void;
  showLeftBorder: boolean;
}) {
  return (
    <div
      className="relative"
      style={{ borderInlineStart: showLeftBorder ? '1px solid var(--rule)' : 'none' }}
    >
      {/* Hour cells (clickable empty slots) */}
      {HOURS_VISIBLE.map((h, i) => (
        <button
          key={h}
          onClick={() => {
            const d = new Date(day);
            d.setHours(h, 0, 0, 0);
            onSlotClick(d);
          }}
          className="absolute inset-x-0 hover:bg-[var(--paper-hover)] transition-colors"
          style={{
            top: i * HOUR_HEIGHT,
            height: HOUR_HEIGHT,
            borderTop: i === 0 ? 'none' : '1px solid var(--rule-soft)',
            cursor: 'cell',
          }}
          aria-label={`إضافة موعد الساعة ${h}:00`}
        />
      ))}

      {/* Event blocks */}
      {events.map((ev) => {
        const start = new Date(ev.starts_at);
        const end = new Date(ev.ends_at);
        const startHour = start.getHours() + start.getMinutes() / 60;
        const endHour = end.getHours() + end.getMinutes() / 60;

        const top = (startHour - HOURS_VISIBLE[0]) * HOUR_HEIGHT;
        const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 24);
        if (top < -HOUR_HEIGHT || top > HOURS_VISIBLE.length * HOUR_HEIGHT) return null;

        const isExternal = ev.kind === 'external';
        const isCancelled = ev.kind === 'booking' && ev.status === 'cancelled';

        return (
          <button
            key={ev.id}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick(ev);
            }}
            className="absolute inset-x-1 px-2 py-1 text-right overflow-hidden text-xs"
            style={{
              top,
              height,
              background: isExternal
                ? 'color-mix(in srgb, var(--rule-strong) 60%, var(--paper))'
                : isCancelled
                ? 'transparent'
                : 'color-mix(in srgb, var(--primary) 88%, var(--paper-sink))',
              border: isCancelled
                ? '1px dashed var(--rule-strong)'
                : '1px solid color-mix(in srgb, var(--primary-glow) 50%, transparent)',
              color: isExternal
                ? 'var(--ink-soft)'
                : isCancelled
                ? 'var(--ink-faint)'
                : 'var(--ink)',
              borderRadius: '3px',
              textDecoration: isCancelled ? 'line-through' : 'none',
            }}
          >
            <div className="font-semibold truncate">
              {ev.kind === 'booking'
                ? ev.customer_name || ev.customer_phone || 'موعد'
                : ev.summary}
            </div>
            {ev.kind === 'booking' && ev.service && (
              <div
                className="text-[10px] truncate mt-0.5"
                style={{ color: 'var(--ink-soft)' }}
              >
                {ev.service}
              </div>
            )}
            <div
              className="text-[9px] tabular mt-0.5"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              dir="ltr"
            >
              {start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Create booking modal
// ─────────────────────────────────────────────────────────────────
function CreateBookingModal({
  initialStart,
  onClose,
  onSaved,
}: {
  initialStart: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialEnd = new Date(initialStart);
  initialEnd.setMinutes(initialEnd.getMinutes() + 30);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState('');
  const [start, setStart] = useState(isoLocal(initialStart));
  const [end, setEnd] = useState(isoLocal(initialEnd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name || null,
          customer_phone: phone || null,
          service: service || null,
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(end).toISOString(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'save_failed');
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'save_failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="موعد جديد" onClose={onClose}>
      <div className="space-y-5">
        <Field label="اسم العميل">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: أحمد"
            className="input-boxed"
          />
        </Field>
        <Field label="رقم الجوال">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+9715xxxxxxx"
            dir="ltr"
            className="input-boxed text-left"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </Field>
        <Field label="الخدمة">
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="مثلاً: تنظيف أسنان"
            className="input-boxed"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="من">
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              dir="ltr"
              className="input-boxed text-left"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
          <Field label="إلى">
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              dir="ltr"
              className="input-boxed text-left"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--signal)' }}>
            خطأ: {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost h-10">
            إلغاء
          </button>
          <button
            onClick={save}
            disabled={saving || (!name && !phone)}
            className="btn-primary h-10"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جارٍ الحفظ...</span>
              </>
            ) : (
              <span>حفظ الموعد</span>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Event detail modal
// ─────────────────────────────────────────────────────────────────
function EventDetailModal({
  event,
  onClose,
  onDeleted,
}: {
  event: CalEvent;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);

  async function deleteBooking() {
    if (event.kind !== 'booking') return;
    if (!confirm('إلغاء هذا الموعد؟')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar/bookings/${event.id}`, {
        method: 'DELETE',
      });
      const j = await res.json().catch(() => ({}));
      // 207 = booking cancelled but Google Calendar event couldn't be deleted
      if (res.status === 207 || j.warning === 'calendar_delete_failed') {
        alert(
          'تم إلغاء الموعد لكن لم نتمكن من حذف الحدث من Google Calendar.\nاضغط "تنظيف الجدول" لإعادة المحاولة.'
        );
        onDeleted();
        return;
      }
      if (!res.ok) throw new Error(j.error ?? 'delete_failed');
      onDeleted();
    } catch (err: any) {
      alert(`فشل الحذف: ${err?.message ?? 'unknown'}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ModalShell
      title={event.kind === 'booking' ? 'تفاصيل الموعد' : 'حدث في التقويم'}
      onClose={onClose}
    >
      <div className="space-y-4">
        {event.kind === 'booking' ? (
          <>
            <DetailRow
              label="العميل"
              value={event.customer_name || event.customer_phone || 'بدون اسم'}
            />
            {event.customer_phone && (
              <DetailRow label="الجوال" value={event.customer_phone} dir="ltr" mono />
            )}
            {event.service && <DetailRow label="الخدمة" value={event.service} />}
            <DetailRow
              label="الحالة"
              value={
                event.status === 'confirmed'
                  ? 'مؤكّد'
                  : event.status === 'pending'
                  ? 'بالانتظار'
                  : 'ملغى'
              }
            />
          </>
        ) : (
          <DetailRow label="العنوان" value={event.summary} />
        )}

        <DetailRow
          label="من"
          value={start.toLocaleString('ar-AE', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        />
        <DetailRow
          label="إلى"
          value={end.toLocaleString('ar-AE', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        />

        {event.kind === 'booking' && event.status !== 'cancelled' && (
          <div
            className="flex justify-end gap-3 pt-4"
            style={{ borderTop: '1px solid var(--rule)' }}
          >
            <button
              onClick={deleteBooking}
              disabled={deleting}
              className="btn-signal h-10 gap-2"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>إلغاء الموعد</span>
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function DetailRow({
  label,
  value,
  dir,
  mono,
}: {
  label: string;
  value: string;
  dir?: 'ltr';
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 py-2.5" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
      <div className="eyebrow">{label}</div>
      <div
        className="text-sm"
        dir={dir}
        style={{
          color: 'var(--ink)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────────────────────────
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--paper-sink) 70%, transparent)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          <h3 className="display-ar text-base" style={{ color: 'var(--ink)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center"
            style={{ color: 'var(--ink-faint)' }}
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
