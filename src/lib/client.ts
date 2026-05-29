import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type ClientType = 'clinic' | 'salon' | 'real_estate';
export type CalendarMode = 'gregorian' | 'hijri' | 'dual';
/**
 * Tenant operating country (Track E). Branches compliance UI:
 *   - UAE → RERA Forms A/B/F/I/U, DLD fields, goAML XML draft.
 *   - KSA → REGA/SAFIU equivalents, FAL license, Iqama-based KYC.
 * Null on pre-migration tenants; operator picks during settings review.
 */
export type TenantCountry = 'UAE' | 'KSA';
/**
 * UAE emirate of the brokerage's RERA/regulator registration (item 22).
 * Null when not yet captured — UI treats null as "EMIRATE NOT VERIFIED" and
 * never defaults to Dubai. KSA tenants stay null (orthogonal field).
 */
export type Emirate =
  | 'dubai'
  | 'abu_dhabi'
  | 'sharjah'
  | 'ajman'
  | 'umm_al_quwain'
  | 'ras_al_khaimah'
  | 'fujairah';
/**
 * Which WhatsApp transport carries this tenant's traffic.
 *
 * `cloud_api`  — Meta-approved WABA. 1–3 week setup; canonical for
 *                consumer-facing brands but slow to provision.
 * `evolution`  — Self-hosted Baileys/Evolution bridge. QR-scan in
 *                minutes, PDPL-friendly (self-hosted; in-region hosting
 *                possible, not guaranteed), ideal for pilot brokerages who
 *                can't wait for Meta approval.
 * `mock`       — Dev/sandbox loopback. Never billed, never delivered.
 */
export type Transport = 'cloud_api' | 'evolution' | 'mock';

/**
 * Roles within a tenant. Backed by the public.tenant_role enum.
 *   - owner  : everything, including team management + role changes
 *   - admin  : everything except removing/demoting the owner
 *   - agent  : full operational access (replies, KYC, bookings)
 *   - viewer : read-only (UI-enforced for now; same RLS as agent)
 */
export type TenantRole = 'owner' | 'admin' | 'agent' | 'viewer';

export interface CurrentClient {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  wa_number: string | null;
  is_sandbox: boolean;
  business_timezone: string;
  default_calendar_id: string | null;
  /** Vertical the client operates in — branches prompts, UI, KB fields, nav. */
  client_type: ClientType;
  /** Whether the bot must capture explicit consent (PDPL Art. 25 etc.). */
  consent_required: boolean;
  /** Stated data-region PREFERENCE (procurement hint). NOT an enforced
   *  residency control — Anvira does not control Supabase/Meta storage
   *  location. Self-hosted Evolution is the only in-region lever. */
  data_region: string | null;
  /**
   * Whether KYC/DNFBP compliance workflow is active for this brokerage.
   * Defaults false until the operator opts in via /kyc.
   * Backed by `dashboard_clients.kyc_enabled` (Wave-3 migration).
   */
  kyc_enabled: boolean;
  /**
   * Which calendar format to render across the UI. 'gregorian' is the
   * default; 'hijri' shows only Islamic dates; 'dual' shows both.
   * Backed by `dashboard_clients.calendar_mode` (Wave-3 migration).
   */
  calendar_mode: CalendarMode;
  /** Languages the bot is allowed to reply in. AR+EN baseline. */
  enabled_languages: string[];
  /**
   * Transport in use for this tenant. Backed by `dashboard_clients.transport`
   * (Phase-B migration). Defaults 'cloud_api' on pre-migration tenants so
   * legacy clients render the right transport panel.
   */
  transport: Transport;
  /**
   * Evolution instance name (slug) once provisioned. Null when the
   * tenant hasn't scanned their QR yet, or for non-evolution transports.
   * The secret API key is intentionally NOT exposed to the client —
   * stays on the server.
   */
  evolution_instance: string | null;
  /** Operating country (Track E). Null on pre-migration tenants. */
  country: TenantCountry | null;
  /** REGA FAL license — required for KSA brokerages, null elsewhere. */
  fal_license_number: string | null;
  /** REGA brokerage company ID — separate from the FAL license. */
  rega_company_id: string | null;
  /**
   * UAE emirate of the brokerage's RERA/regulator registration (item 22).
   * Null on pre-migration and pre-capture tenants; the RERA forms layer
   * treats null as EMIRATE_NOT_VERIFIED and NEVER defaults to Dubai/RERA.
   */
  emirate: Emirate | null;
  /** Evolution server base URL for this tenant. Null pre-provision. */
  evolution_server_url: string | null;
  /**
   * The current operator's role on THIS tenant. Returns 'owner' when the
   * user matches dashboard_clients.owner_id and no tenant_members row
   * exists yet (legacy single-owner brokerages before migration backfill).
   */
  current_user_role: TenantRole;
}

/**
 * Resolve the currently logged-in operator's client (tenant).
 *
 * Returns null if the user has no client yet (new signup).
 * Server pages should call this and redirect to /onboarding when null.
 */
export async function getCurrentClient(): Promise<CurrentClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the active tenant. Multi-tenant priority order:
  //   1. tenant_members row with role='owner'    (own brokerage)
  //   2. tenant_members row with any other role   (invited member)
  //   3. dashboard_clients.owner_id = user.id     (legacy single-owner,
  //      pre-team-migration fallback)
  // Today we pick the FIRST match; per-tenant switching belongs in a
  // future PR (tenant picker UI + cookie/session-stored client_id).
  let activeClientId: string | null = null;
  let resolvedRole: TenantRole | null = null;

  const { data: memberships } = await supabase
    .from('tenant_members')
    .select('client_id, role, invited_at')
    .eq('user_id', user.id)
    .eq('status', 'accepted')
    // Owners ranked first via the enum's lexical order trick — 'owner'
    // sorts before 'admin'/'agent'/'viewer' alphabetically. Tie-break
    // on invited_at to give returning multi-tenant operators a stable
    // landing pad.
    .order('role', { ascending: true })
    .order('invited_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberships) {
    activeClientId = memberships.client_id as string;
    resolvedRole = memberships.role as TenantRole;
  }

  // Wave-3 columns (kyc_enabled, calendar_mode, enabled_languages) may
  // not exist yet. We fall back to a narrower select if the wide one
  // fails so the dashboard stays usable on pre-migration databases.
  let data: Record<string, unknown> | null = null;
  const wideQuery = supabase
    .from('dashboard_clients')
    .select(
      'id, slug, name, owner_id, wa_number, is_sandbox, business_timezone, default_calendar_id, client_type, consent_required, data_region, kyc_enabled, calendar_mode, enabled_languages, transport, evolution_instance, evolution_server_url, country, fal_license_number, rega_company_id, emirate'
    );
  const wide = await (activeClientId
    ? wideQuery.eq('id', activeClientId).maybeSingle()
    : wideQuery
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle());
  if (wide.data) {
    data = wide.data as Record<string, unknown>;
  } else if (wide.error) {
    // Drop Wave-3 columns — legacy pre-migration select.
    const narrowQuery = supabase
      .from('dashboard_clients')
      .select(
        'id, slug, name, owner_id, wa_number, is_sandbox, business_timezone, default_calendar_id, client_type, consent_required, data_region'
      );
    const narrow = await (activeClientId
      ? narrowQuery.eq('id', activeClientId).maybeSingle()
      : narrowQuery
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle());
    data = (narrow.data ?? null) as Record<string, unknown> | null;
  }
  if (!data) return null;

  const calMode = data.calendar_mode;
  const enabledLangsRaw = data.enabled_languages;
  const transportRaw = data.transport;
  const transport: Transport =
    transportRaw === 'evolution' || transportRaw === 'mock'
      ? transportRaw
      : 'cloud_api';
  // Role precedence: tenant_members.role (if we found one) wins; else
  // the legacy owner_id-equals-user shortcut promotes the caller to
  // owner (pre-migration single-owner brokerages).
  const currentUserRole: TenantRole =
    resolvedRole ?? (data.owner_id === user.id ? 'owner' : 'agent');
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    owner_id: data.owner_id as string,
    wa_number: (data.wa_number ?? null) as string | null,
    is_sandbox: (data.is_sandbox ?? false) as boolean,
    business_timezone: data.business_timezone as string,
    default_calendar_id: (data.default_calendar_id ?? null) as string | null,
    client_type: (data.client_type ?? 'clinic') as ClientType,
    consent_required: (data.consent_required ?? false) as boolean,
    data_region: (data.data_region ?? null) as string | null,
    kyc_enabled: (data.kyc_enabled ?? false) as boolean,
    calendar_mode:
      calMode === 'hijri' || calMode === 'dual' ? (calMode as CalendarMode) : 'gregorian',
    enabled_languages: Array.isArray(enabledLangsRaw)
      ? (enabledLangsRaw as unknown[]).filter((v): v is string => typeof v === 'string')
      : ['ar', 'en'],
    transport,
    evolution_instance: (data.evolution_instance ?? null) as string | null,
    evolution_server_url: (data.evolution_server_url ?? null) as string | null,
    country:
      data.country === 'UAE' || data.country === 'KSA'
        ? (data.country as TenantCountry)
        : null,
    fal_license_number: (data.fal_license_number ?? null) as string | null,
    rega_company_id: (data.rega_company_id ?? null) as string | null,
    emirate:
      typeof data.emirate === 'string' && data.emirate.length > 0
        ? (data.emirate as Emirate)
        : null,
    current_user_role: currentUserRole,
  };
}

/**
 * Server-component helper. Returns the client or redirects.
 *
 * If user is not authed → /login.
 * If user has no client → /onboarding.
 */
export async function requireCurrentClient(): Promise<CurrentClient> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const client = await getCurrentClient();
  if (!client) redirect('/onboarding');
  return client;
}
