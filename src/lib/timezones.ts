/**
 * Single source of truth for the timezones we offer in client-facing UIs.
 * Gulf-only for v1: Saudi Arabia, UAE, Qatar, Kuwait, Bahrain, Oman.
 *
 * IANA name MUST match the value the backend stores in
 * dashboard_clients.business_timezone and settings.business_timezone.
 */
export interface GulfTimezone {
  iana: string;
  /** Arabic city / country label shown in the dropdown. */
  label: string;
  /** Static UTC offset string. Gulf doesn't observe DST so this is fixed. */
  utcOffset: string;
}

export const GULF_TIMEZONES: GulfTimezone[] = [
  { iana: 'Asia/Riyadh', label: 'الرياض · السعودية', utcOffset: 'UTC+3' },
  { iana: 'Asia/Dubai', label: 'دبي · الإمارات', utcOffset: 'UTC+4' },
  { iana: 'Asia/Qatar', label: 'الدوحة · قطر', utcOffset: 'UTC+3' },
  { iana: 'Asia/Kuwait', label: 'الكويت', utcOffset: 'UTC+3' },
  { iana: 'Asia/Bahrain', label: 'المنامة · البحرين', utcOffset: 'UTC+3' },
  { iana: 'Asia/Muscat', label: 'مسقط · عُمان', utcOffset: 'UTC+4' },
];

export function timezoneLabel(iana: string): string {
  return GULF_TIMEZONES.find((tz) => tz.iana === iana)?.label ?? iana;
}
