/**
 * Portal keys exposed by the admin (mirrors the `lead_source` enum prefix
 * `portal_<key>` on the backend). Keeping this in a plain module so it can
 * be imported by both Route Handlers (which restrict their export set)
 * and client components.
 */
export const PORTAL_KEYS = [
  'bayut',
  'property_finder',
  'dubizzle',
  'aqar',
  'wasalt',
  'sakan',
] as const;
export type PortalKey = (typeof PORTAL_KEYS)[number];
