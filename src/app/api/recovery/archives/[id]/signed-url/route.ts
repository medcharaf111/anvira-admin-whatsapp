import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/recovery/archives/[id]/signed-url — proxies to the backend
 * recovery endpoint which (a) verifies tenant scope, (b) writes an
 * archive_downloads row with actor + IP, (c) mints a 5-min signed URL.
 *
 * Why through the backend instead of just calling Supabase Storage from
 * here: the audit row needs to be written by trusted code that can't be
 * bypassed by a curl-savvy admin. Doing it in the browser-facing Next.js
 * layer would mean the audit log is whatever the client sends — useless.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const { id: archiveId } = await params;
  if (!archiveId || !/^[0-9a-f-]{36}$/i.test(archiveId)) {
    return NextResponse.json({ error: 'invalid_archive_id' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(
    ctx,
    `/internal/recovery/archives/${encodeURIComponent(archiveId)}/signed-url`,
    {
      method: 'POST',
      headers: {
        'X-Actor-Email': user.email ?? '',
        // Pass through the originating IP so the backend's audit row
        // has the real downloader, not the Vercel edge IP.
        'X-Actor-IP': _req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
      },
    }
  );

  if (!result.provisioned) {
    return NextResponse.json(
      { error: 'backend_not_configured' },
      { status: 503 }
    );
  }
  if (result.ok) {
    logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'recovery.archive.download',
      targetType: 'conversation_archive',
      targetId: archiveId,
      details: {},
    });
  }
  return NextResponse.json(result.json as Record<string, unknown>, {
    status: result.status,
  });
}
