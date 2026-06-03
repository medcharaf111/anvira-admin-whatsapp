import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { fetchActiveConversations } from '@/lib/operator/whatsapp-numbers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/evolution/active-count
 *
 * Returns the 7-day active-conversation count for the calling tenant,
 * surfaced as the impact-warning line in the unlink-number modal
 * ("{N} محادثات نشطة في آخر ٧ أيام"). Tenant-scoped via the session
 * cookie; the `wa_number` query param is accepted for future per-number
 * scoping but ignored today because every tenant only has one primary
 * Evolution instance.
 *
 * Auth posture matches the unlink endpoint: owner or admin only,
 * real_estate clients only. Degrades to `{ count: 0 }` on any DB error
 * — the modal renders "—" rather than blocking the operator from
 * proceeding when the count is unavailable.
 */
export async function GET(_req: NextRequest) {
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
  if (
    client.current_user_role !== 'owner' &&
    client.current_user_role !== 'admin'
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { count, since } = await fetchActiveConversations(client.id);
  return NextResponse.json({ count, since });
}
