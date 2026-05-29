import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

export interface DataDeletionRequestRow {
  id: string;
  conversation_id: string | null;
  customer_phone: string;
  requested_at: string;
  trigger_message: string | null;
  // 'partially_erased' (C5): PII erased but AML/KYC records retained under
  // UAE Decree 10/2025 5-year hold. retained_case_ids + retention_until say
  // what was kept and until when.
  status:
    | 'pending'
    | 'confirmed'
    | 'auto_confirmed'
    | 'partially_erased'
    | 'cancelled';
  confirmed_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  retained_case_ids: string[] | null;
  retention_until: string | null;
}

/**
 * GET /api/data-requests — list this tenant's PDPL deletion requests
 * (newest first, capped at 100). Pending requests show at the top of
 * the admin /data-requests page; resolved ones below for audit.
 *
 * Reads via Supabase RLS directly — no backend round-trip needed
 * because there's no orchestration, just a tenant-scoped read.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const { data, error } = await supabase
    .from('data_deletion_requests')
    .select(
      'id, conversation_id, customer_phone, requested_at, trigger_message, status, confirmed_at, cancelled_at, notes, retained_case_ids, retention_until'
    )
    .eq('client_id', client.id)
    .order('requested_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: (data ?? []) as DataDeletionRequestRow[] });
}
