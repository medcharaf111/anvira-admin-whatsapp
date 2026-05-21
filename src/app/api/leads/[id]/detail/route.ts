import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/:id/detail — drawer payload: the last 10 messages on
 * this conversation + the full leads_qualification row (including the
 * raw_extracted blob and any fields the row index/list view doesn't
 * carry). Single round-trip on drawer open.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // Verify ownership in one cheap query before reading the related rows.
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('client_id', client.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [msgRes, qualRes] = await Promise.all([
    supabase
      .from('messages')
      .select('id, body, direction, sender, created_at, language, metadata')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('leads_qualification')
      .select(
        'budget_min, budget_max, budget_currency, bedrooms_wanted, property_types_wanted, preferred_locations, citizenship, residency_status, mortgage_status, timeline, intent, language_preference, notes, raw_extracted'
      )
      .eq('conversation_id', id)
      .maybeSingle(),
  ]);

  const messages = (msgRes.data ?? []).slice().reverse();

  return NextResponse.json({
    messages,
    qualification: qualRes.data ?? null,
  });
}
