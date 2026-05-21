'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, Plus, X, Loader2, Trash2, Wand2,
  Building2, MapPin, Monitor, CalendarClock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ClientType, CalendarMode } from '@/lib/client';
import { formatViewingDate } from '@/lib/dates';

type ViewingMode = 'showroom' | 'site' | 'virtual' | 'appointment';

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
  /** RE only — null on clinic/salon bookings. */
  viewing_mode: ViewingMode | null;
  booking_type: 'appointment' | 'viewing' | null;
}

/**
 * Per-mode visual treatment for RE viewings.
 *
 * Each mode gets its own icon + a color stripe and a tinted background.
 * Colors are token-driven so dark mode stays cohesive — we tint the
 * existing semantic palette rather than introducing new hex codes.
 *
 *   showroom → warm primary tint  (in-office viewing — the safest mode)
 *   site     → sage tint          (on-property — needs travel)
 *   virtual  → gold tint          (Zoom / FaceTime — lowest friction)
 *   appointment → legacy clinic/salon — unchanged primary tint
 */
const VIEWING_MODE_STYLES: Record<
  ViewingMode,
  {
    stripe: string;
    bg: string;
    border: string;
    icon: LucideIcon;
    labelAr: string;
  }
> = {
  showroom: {
    stripe: 'var(--primary-glow)',
    bg: 'color-mix(in srgb, var(--primary-glow) 14%, var(--paper-lift))',
    border: 'color-mix(in srgb, var(--primary-glow) 35%, transparent)',
    icon: Building2,
    labelAr: 'معاينة في صالة العرض',
  },
  site: {
    stripe: 'var(--primary)',
    bg: 'color-mix(in srgb, var(--primary) 12%, var(--paper-lift))',
    border: 'color-mix(in srgb, var(--primary) 32%, transparent)',
    icon: MapPin,
    labelAr: 'معاينة على الموقع',
  },
  virtual: {
    stripe: 'var(--warn)',
    bg: 'color-mix(in srgb, var(--warn) 14%, var(--paper-lift))',
    border: 'color-mix(in srgb, var(--warn) 35%, transparent)',
    icon: Monitor,
    labelAr: 'معاينة افتراضية',
  },
  appointment: {
    stripe: 'var(--primary-glow)',
    bg: 'color-mix(in srgb, var(--primary) 88%, var(--paper-sink))',
    border: 'color-mix(in srgb, var(--primary-glow) 50%, transparent)',
    icon: CalendarClock,
    labelAr: 'موعد',
  },
};

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

/** Extract hour + minute as observed in the given IANA timezone. */
function zonedHourMinute(date: Date, tz: string): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
}

/** Extract year/month/day/dayOfWeek (Sun=0..Sat=6) as observed in the given timezone. */
function zonedYMD(
  date: Date,
  tz: string
): { year: number; month: number; day: number; dayOfWeek: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    dayOfWeek: dowMap[get('weekday')] ?? 0,
  };
}

/** True iff the two dates fall on the same calendar day in the given timezone. */
function sameYMDInTz(a: Date, b: Date, tz: string): boolean {
  const za = zonedYMD(a, tz);
  const zb = zonedYMD(b, tz);
  return za.year === zb.year && za.month === zb.month && za.day === zb.day;
}

/**
 * Return a Date pointing to noon (in the given timezone) on the Sunday that
 * begins the current week. Using noon-in-tz makes the resulting Date robust
 * to cross-timezone-line viewers and DST shifts.
 */
function startOfWeekInTz(now: Date, tz: string): Date {
  const z = zonedYMD(now, tz);
  // Build UTC noon for Sunday's Y-M-D, then offset-correct so the same instant
  // formats as 12:00 in tz. Date.UTC handles negative day rollover.
  const sundayDayNum = z.day - z.dayOfWeek;
  const utcNoonCandidate = new Date(Date.UTC(z.year, z.month - 1, sundayDayNum, 12, 0, 0));
  const hourInTz = zonedHourMinute(utcNoonCandidate, tz).hour;
  const offsetHours = hourInTz - 12;
  return new Date(utcNoonCandidate.getTime() - offsetHours * 3600_000);
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

export function CalendarView({
  businessTimezone,
  clientType = 'clinic',
  calendarMode = 'gregorian',
}: {
  businessTimezone: string;
  clientType?: ClientType;
  calendarMode?: CalendarMode;
}) {
  const isRE = clientType === 'real_estate';
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekInTz(new Date(), businessTimezone));
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
    return events.filter((e) => sameYMDInTz(new Date(e.starts_at), day, businessTimezone));
  }

  return (
    <div>
      {/* Toolbar */}
      {/* Legend — only for RE clients, so the operator can decode the
          stripe colors at a glance. */}
      {isRE && (
        <div
          className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[11px]"
          style={{ color: 'var(--ink-soft)' }}
        >
          <span
            className="text-[10px] tracking-widest uppercase me-1"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          >
            نوع المعاينة
          </span>
          {(['showroom', 'site', 'virtual'] as const).map((m) => {
            const s = VIEWING_MODE_STYLES[m];
            const Icon = s.icon;
            return (
              <span key={m} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block"
                  style={{
                    width: 12,
                    height: 3,
                    background: s.stripe,
                    borderRadius: 1,
                  }}
                />
                <Icon className="w-3 h-3" strokeWidth={1.75} />
                <span>{s.labelAr}</span>
              </span>
            );
          })}
        </div>
      )}

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
            onClick={() => setWeekStart(startOfWeekInTz(new Date(), businessTimezone))}
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
          {/* Week range — Hijri/dual modes route through formatViewingDate
              so the brokerage's tenant-level preference is respected; in
              Gregorian mode we keep the original Arabic locale string for
              backwards compat with the rest of the page. */}
          {calendarMode === 'gregorian' ? (
            <>
              {weekStart.toLocaleDateString('ar-AE', { day: 'numeric', month: 'long', timeZone: businessTimezone })}{' '}
              —{' '}
              {addDays(weekStart, 6).toLocaleDateString('ar-AE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: businessTimezone })}
            </>
          ) : (
            <>
              {formatViewingDate(weekStart, {
                mode: calendarMode,
                lang: 'ar',
                timeZone: businessTimezone,
                withWeekday: false,
              })}{' '}
              —{' '}
              {formatViewingDate(addDays(weekStart, 6), {
                mode: calendarMode,
                lang: 'ar',
                timeZone: businessTimezone,
                withWeekday: false,
              })}
            </>
          )}
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
            const isToday = sameYMDInTz(d, new Date(), businessTimezone);
            // Hijri day number — computed only when we need it so
            // gregorian-mode operators don't pay for an extra format
            // call seven times per render.
            let hijriDay: string | null = null;
            if (calendarMode === 'hijri' || calendarMode === 'dual') {
              try {
                hijriDay = new Intl.DateTimeFormat(
                  'ar-SA-u-ca-islamic-umalqura',
                  { day: 'numeric', timeZone: businessTimezone }
                ).format(d);
              } catch {
                hijriDay = null;
              }
            }
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
                  {d.toLocaleDateString('ar-AE', { weekday: 'short', timeZone: businessTimezone })}
                </div>
                {calendarMode === 'hijri' ? (
                  <div
                    className="tabular text-lg mt-1"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 400,
                      color: isToday ? 'var(--primary-glow)' : 'var(--ink)',
                    }}
                  >
                    {hijriDay ??
                      d.toLocaleDateString('en-US', { day: 'numeric', timeZone: businessTimezone })}
                  </div>
                ) : (
                  <>
                    <div
                      className="tabular text-lg mt-1"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 400,
                        color: isToday ? 'var(--primary-glow)' : 'var(--ink)',
                      }}
                    >
                      {d.toLocaleDateString('en-US', { day: 'numeric', timeZone: businessTimezone })}
                    </div>
                    {calendarMode === 'dual' && hijriDay && (
                      <div
                        className="text-[10px] tabular mt-0.5"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                      >
                        {hijriDay}
                      </div>
                    )}
                  </>
                )}
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
              businessTimezone={businessTimezone}
              isRE={isRE}
              calendarMode={calendarMode}
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
            isRE={isRE}
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
            businessTimezone={businessTimezone}
            isRE={isRE}
            calendarMode={calendarMode}
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
  businessTimezone,
  isRE,
  calendarMode: _calendarMode,
}: {
  day: Date;
  events: CalEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (ev: CalEvent) => void;
  showLeftBorder: boolean;
  businessTimezone: string;
  isRE: boolean;
  calendarMode?: CalendarMode;
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
        const sZ = zonedHourMinute(start, businessTimezone);
        const eZ = zonedHourMinute(end, businessTimezone);
        const startHour = sZ.hour + sZ.minute / 60;
        const endHour = eZ.hour + eZ.minute / 60;

        const top = (startHour - HOURS_VISIBLE[0]) * HOUR_HEIGHT;
        const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 24);
        if (top < -HOUR_HEIGHT || top > HOURS_VISIBLE.length * HOUR_HEIGHT) return null;

        // Cancelled bookings are filtered server-side, but stay defensive
        if (ev.kind === 'booking' && ev.status === 'cancelled') return null;
        const isExternal = ev.kind === 'external';

        // Resolve visual treatment. Non-booking events keep the legacy
        // muted card. RE bookings tint per viewing_mode; clinic/salon
        // bookings (no viewing_mode) fall back to the 'appointment' style
        // which matches the old default.
        const mode: ViewingMode =
          ev.kind === 'booking' && isRE && ev.viewing_mode
            ? ev.viewing_mode
            : 'appointment';
        const style = VIEWING_MODE_STYLES[mode];
        const Icon = style.icon;
        const showModeChrome = ev.kind === 'booking' && isRE;

        return (
          <button
            key={ev.id}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick(ev);
            }}
            title={showModeChrome ? style.labelAr : undefined}
            className="absolute inset-x-1 overflow-hidden text-xs group"
            style={{
              top,
              height,
              background: isExternal
                ? 'color-mix(in srgb, var(--rule-strong) 60%, var(--paper))'
                : style.bg,
              border: `1px solid ${isExternal ? 'var(--rule)' : style.border}`,
              color: isExternal ? 'var(--ink-soft)' : 'var(--ink)',
              borderRadius: '3px',
              paddingInlineStart: showModeChrome ? '0.625rem' : '0.5rem',
              paddingInlineEnd: '0.5rem',
              paddingBlock: '0.25rem',
              textAlign: 'right',
              position: 'absolute',
            }}
          >
            {/* Color stripe — only on RE booking events, anchored to the
                start edge in RTL (inline-start). */}
            {showModeChrome && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  insetInlineStart: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: style.stripe,
                }}
              />
            )}

            <div className="flex items-start gap-1.5">
              {showModeChrome && (
                <Icon
                  className="w-3 h-3 mt-[2px] shrink-0"
                  strokeWidth={1.75}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {ev.kind === 'booking'
                    ? ev.customer_name || ev.customer_phone || (isRE ? 'معاينة' : 'موعد')
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
                  {start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: businessTimezone })}
                </div>
              </div>
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
  isRE,
}: {
  initialStart: Date;
  onClose: () => void;
  onSaved: () => void;
  isRE: boolean;
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
    <ModalShell title={isRE ? 'معاينة جديدة' : 'موعد جديد'} onClose={onClose}>
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
        <Field label={isRE ? 'العقار / المشروع' : 'الخدمة'}>
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder={
              isRE
                ? 'مثلاً: Emaar Beachfront 2BR'
                : 'مثلاً: استشارة'
            }
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
  businessTimezone,
  isRE,
  calendarMode = 'gregorian',
}: {
  event: CalEvent;
  onClose: () => void;
  onDeleted: () => void;
  businessTimezone: string;
  isRE: boolean;
  calendarMode?: CalendarMode;
}) {
  const [deleting, setDeleting] = useState(false);
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);

  async function deleteBooking() {
    if (event.kind !== 'booking') return;
    if (!confirm(isRE ? 'إلغاء هذه المعاينة؟' : 'إلغاء هذا الموعد؟')) return;
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
      title={
        event.kind === 'booking'
          ? isRE
            ? 'تفاصيل المعاينة'
            : 'تفاصيل الموعد'
          : 'حدث في التقويم'
      }
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
            {event.service && (
              <DetailRow
                label={isRE ? 'العقار / المشروع' : 'الخدمة'}
                value={event.service}
              />
            )}
            {isRE && event.viewing_mode && (
              <DetailRow
                label="نوع المعاينة"
                value={
                  VIEWING_MODE_STYLES[event.viewing_mode]?.labelAr ??
                  event.viewing_mode
                }
              />
            )}
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
          value={formatViewingDate(start, {
            mode: calendarMode,
            lang: 'ar',
            timeZone: businessTimezone,
            withTime: true,
            withWeekday: true,
          })}
        />
        <DetailRow
          label="إلى"
          value={formatViewingDate(end, {
            mode: calendarMode,
            lang: 'ar',
            timeZone: businessTimezone,
            withTime: true,
            withWeekday: true,
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
              <span>{isRE ? 'إلغاء المعاينة' : 'إلغاء الموعد'}</span>
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
