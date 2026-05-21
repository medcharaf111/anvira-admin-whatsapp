import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

type SanctionsProvider = 'stub' | 'opensanctions' | 'comply_advantage';

const VALID_PROVIDERS: ReadonlySet<string> = new Set([
  'stub',
  'opensanctions',
  'comply_advantage',
]);

/**
 * GET /api/sanctions/status — exposes the server-side `SANCTIONS_PROVIDER`
 * env to authenticated RE operators so the KYC page can render the
 * provider chip. Server-controlled (not per-tenant), but we still gate
 * on session + real_estate + kyc_enabled to avoid leaking infra config
 * to other tenants or to clinic/salon tenants.
 *
 * Defaults to 'stub' when unset — dev/sandbox mode.
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

  const raw = (process.env.SANCTIONS_PROVIDER ?? 'stub').toLowerCase().trim();
  const provider: SanctionsProvider = (
    VALID_PROVIDERS.has(raw) ? raw : 'stub'
  ) as SanctionsProvider;

  return NextResponse.json({ provider });
}
