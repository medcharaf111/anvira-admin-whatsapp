import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

export interface LeadSourcesResponse {
  wa_number: string | null;
  inbound_email_token: string | null;
  inbound_email_enabled: boolean;
  llm_detected_count_30d: number;
  inbound_email_domain: string;
  /**
   * Computed `<local-part>@<domain>` based on the stored token's shape:
   *   - 24-char hex (legacy random token) → `leads-<hex>@<domain>`
   *   - anything else (vanity slug)        → `<slug>@<domain>`
   * Null when no token is provisioned.
   */
  full_address: string | null;
}

/**
 * Build the full email address. Legacy random tokens (24 hex chars) get
 * the `leads-` prefix prepended for display so existing portal-forwarding
 * configs keep matching. Vanity slugs (anything else, e.g. `marina-leads`)
 * are used verbatim as the local-part.
 */
function computeFullAddress(token: string | null, domain: string): string | null {
  if (!token) return null;
  const isLegacyHex = /^[a-f0-9]{24}$/.test(token);
  return `${isLegacyHex ? 'leads-' : ''}${token}@${domain}`;
}

/**
 * GET /api/lead-sources — surfaces the three honest lead-source mechanisms
 * for the real-estate Settings panel:
 *   1) the operator's WhatsApp number (always on, sourced from
 *      dashboard_clients.wa_number)
 *   2) email forwarding — whether the operator has provisioned an inbound
 *      address (dashboard_clients.inbound_email_token + inbound_email_enabled)
 *   3) in-conversation LLM detection — a 30-day count of conversations
 *      that have a non-null lead_source on the conversations table.
 *
 * The 30-day count is intentionally "any non-null source" rather than
 * trying to split it by mechanism — the per-mechanism split lives in
 * /analytics. Here we just need a "yes this is working" signal.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });
  if (client.client_type !== 'real_estate') {
    return NextResponse.json({ error: 'not_real_estate' }, { status: 403 });
  }

  // Read the inbound-email columns defensively — if the backend Wave 1.5
  // migration hasn't landed yet, treat the columns as absent/null instead
  // of 500ing on the operator.
  let inboundToken: string | null = null;
  let inboundEnabled = false;
  try {
    const { data: row, error } = await supabase
      .from('dashboard_clients')
      .select('inbound_email_token, inbound_email_enabled')
      .eq('id', client.id)
      .maybeSingle();
    if (!error && row) {
      const r = row as {
        inbound_email_token?: string | null;
        inbound_email_enabled?: boolean | null;
      };
      inboundToken = r.inbound_email_token ?? null;
      inboundEnabled = r.inbound_email_enabled === true;
    }
  } catch {
    // Column missing — leave as null/false.
  }

  // 30-day tally of LLM-tagged (or any-tagged) lead sources.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const { count } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id)
    .not('lead_source', 'is', null)
    .gte('created_at', since);

  const domain =
    process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? 'inbound.anvira.com';
  return NextResponse.json({
    wa_number: client.wa_number,
    inbound_email_token: inboundToken,
    inbound_email_enabled: inboundEnabled,
    llm_detected_count_30d: count ?? 0,
    inbound_email_domain: domain,
    full_address: computeFullAddress(inboundToken, domain),
  } satisfies LeadSourcesResponse);
}
