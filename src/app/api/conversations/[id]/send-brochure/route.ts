import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/conversations/:id/send-brochure — operator-initiated brochure
 * send. We delegate the actual WhatsApp media-message + brochure-template
 * formatting to the backend's `sendBrochure()` helper (it already knows
 * how to attach the floorplan PDF, project deck, and the property card
 * with the correct language). This admin route just authenticates the
 * operator and forwards a small payload.
 *
 * Body shape:
 *   { property_id?: string; project_id?: string }
 * Exactly one must be provided.
 */
export async function POST(
  req: NextRequest,
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

  const body = (await req.json().catch(() => null)) as
    | { property_id?: string; project_id?: string }
    | null;
  if (!body || (!body.property_id && !body.project_id)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (body.property_id && body.project_id) {
    return NextResponse.json(
      { error: 'pick_one' },
      { status: 400 }
    );
  }

  // Verify the conversation belongs to this client.
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('client_id', client.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    return NextResponse.json(
      { error: 'backend_url_missing' },
      { status: 500 }
    );
  }

  // The backend exposes an internal endpoint guarded by the shared
  // secret. Response shape: { ok: boolean, error?: string, reason?: string, detail?: string }.
  // We forward the full JSON (and the backend's status) so the UI can
  // render specific guidance for cases like no_media_attached, instead
  // of a generic "couldn't send" toast.
  let backendStatus = 502;
  let backendJson: Record<string, unknown> | null = null;
  let backendOk = false;
  try {
    const res = await fetch(`${backend}/internal/conversations/send-brochure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SHARED_SECRET ?? '',
        'X-Client-Id': client.id,
      },
      body: JSON.stringify({
        conversation_id: id,
        property_id: body.property_id,
        project_id: body.project_id,
      }),
    });
    backendStatus = res.status;
    backendJson = (await res.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    backendOk = res.ok && backendJson?.ok !== false;
  } catch (err) {
    backendJson = { error: 'backend_unreachable', detail: (err as Error).message };
  }

  if (!backendOk) {
    return NextResponse.json(
      backendJson ?? { error: 'backend_failure' },
      // Mirror backend status when it gave one; fall back to 502 on
      // network errors. 200-with-ok:false (no_media_attached) becomes
      // 422 so the client treats it as a recoverable validation failure
      // rather than a generic server error.
      { status: backendStatus === 200 ? 422 : backendStatus }
    );
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'conversation.send_brochure',
    targetType: 'conversation',
    targetId: id,
    details: {
      property_id: body.property_id,
      project_id: body.project_id,
    },
  });

  return NextResponse.json({ ok: true });
}
