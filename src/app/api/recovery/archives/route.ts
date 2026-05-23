import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

export interface ArchiveListItem {
  id: string;
  storage_path: string;
  archived_at: string;
  conversation_count: number;
  message_count: number;
  size_bytes: number;
}

/**
 * GET /api/recovery/archives — lists this tenant's nightly conversation
 * archives (newest first, capped at 60 entries — 2x the 30-day retention
 * window so any pending prune cycle is visible).
 *
 * Reads directly from Supabase with the operator's RLS context — no
 * backend round-trip needed for the list. The signed-URL endpoint is
 * the one that has to go through the backend (it audits + mints the URL).
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
    .from('conversation_archives')
    .select('id, storage_path, archived_at, conversation_count, message_count, size_bytes')
    .eq('client_id', client.id)
    .order('archived_at', { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ archives: (data ?? []) as ArchiveListItem[] });
}
