/**
 * Calendar-aware date formatting helpers — shared across /calendar,
 * /bookings (/viewings alias), and /leads drawer so all three pages
 * honour the brokerage's `calendar_mode` setting consistently.
 *
 * Three modes:
 *  - 'gregorian' — locale-aware Gregorian only (default).
 *  - 'hijri'     — Umm al-Qura Islamic only (KSA-aligned).
 *  - 'dual'      — Gregorian then Hijri, separated by " · ".
 *
 * We rely on Intl.DateTimeFormat's built-in Umm al-Qura calendar
 * support (`ar-SA-u-ca-islamic-umalqura`) so there's no external lib.
 */
import type { CalendarMode } from '@/lib/client';

export type DateLang = 'ar' | 'en';

interface ViewingDateOptions {
  /** Calendar mode from `dashboard_clients.calendar_mode`. */
  mode?: CalendarMode;
  /** UI language for the human-readable month/weekday. */
  lang?: DateLang;
  /** IANA timezone (e.g. 'Asia/Dubai'). */
  timeZone?: string;
  /** Include time-of-day component. */
  withTime?: boolean;
  /** Include weekday name. */
  withWeekday?: boolean;
}

/**
 * Format a single date according to the brokerage's calendar mode.
 *
 * In 'dual' mode the Gregorian rendering comes first because Arabic
 * readers in the Gulf are familiar with both but read addresses /
 * appointments primarily in Gregorian; Hijri sits as a contextual
 * cue — important during Ramadan and religious holidays.
 */
export function formatViewingDate(
  input: Date | string,
  opts: ViewingDateOptions = {}
): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';

  const {
    mode = 'gregorian',
    lang = 'ar',
    timeZone,
    withTime = false,
    withWeekday = true,
  } = opts;

  const gregOpts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withWeekday ? { weekday: 'short' } : {}),
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    ...(timeZone ? { timeZone } : {}),
  };

  const hijriOpts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  };

  const gregLocale = lang === 'ar' ? 'ar-AE' : 'en-GB';
  // Umm al-Qura is the official Saudi Hijri calendar — matches what
  // ministries print and what the brokerage's KSA team expects.
  const hijriLocale = 'ar-SA-u-ca-islamic-umalqura';

  if (mode === 'hijri') {
    try {
      return new Intl.DateTimeFormat(hijriLocale, hijriOpts).format(date);
    } catch {
      // Older runtimes that don't carry the islamic-umalqura tables —
      // fall through to Gregorian rather than crashing.
      return new Intl.DateTimeFormat(gregLocale, gregOpts).format(date);
    }
  }

  const gregStr = new Intl.DateTimeFormat(gregLocale, gregOpts).format(date);
  if (mode === 'gregorian') return gregStr;

  // mode === 'dual'
  try {
    const hijriStr = new Intl.DateTimeFormat(hijriLocale, hijriOpts).format(date);
    return `${gregStr} · ${hijriStr}`;
  } catch {
    return gregStr;
  }
}

/**
 * Convenience wrapper: short date suitable for table rows and chips.
 */
export function formatShortViewingDate(
  input: Date | string,
  opts: ViewingDateOptions = {}
): string {
  return formatViewingDate(input, { ...opts, withWeekday: false });
}
