import { redirect } from 'next/navigation';

/**
 * Real-estate-friendly alias for /bookings. We keep the underlying page
 * the same — see the label/copy branch inside /bookings that flips to
 * "معاينات / viewings" terminology when client_type === 'real_estate'.
 *
 * Redirecting (rather than duplicating the page) keeps a single source
 * of truth for bookings logic, calendar refs, filters, etc.
 */
export default function ViewingsAliasPage() {
  redirect('/bookings');
}
