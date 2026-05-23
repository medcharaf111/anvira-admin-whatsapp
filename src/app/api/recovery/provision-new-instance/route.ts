import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Backend provisioning includes Evolution createInstance which can take 10-20s.
export const maxDuration = 60;

interface Body {
  old_number_id?: string;
  new_wa_number?: string;
  replacement_reason?: string;
}

/**
 * POST /api/recovery/provision-new-instance — proxies the backend's
 * recovery endpoint. The backend:
 *   1. inserts a new client_numbers row,
 *   2. marks the old row replaced_by + replaced_at + replacement_reason,
 *   3. provisions a fresh Evolution instance,
 *   4. returns the QR endpoint so the operator can immediately scan.
 *
 * Conversation history is NOT migrated — it lives in the DB keyed by
 * client_id + customer_phone, so it lights up the moment the new
 * instance pairs.
 *
 * Real-estate only (mirrors the existing evolution/instances pattern).
 */
export async function POST(req: NextRequest) {
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

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const oldNumberId = body.old_number_id;
  const newWaNumber = (body.new_wa_number ?? '').trim();
  const reason = body.replacement_reason ?? 'banned';

  if (!oldNumberId || !newWaNumber) {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
  }
  if (!/^\+\d{7,15}$/.test(newWaNumber)) {
    return NextResponse.json({ error: 'invalid_wa_number_format' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/recovery/provision-new-instance', {
    method: 'POST',
    body: JSON.stringify({
      client_id: client.id,
      old_number_id: oldNumberId,
      new_wa_number: newWaNumber,
      replacement_reason: reason,
    }),
  });

  if (!result.provisioned) {
    return NextResponse.json({ error: 'backend_not_configured' }, { status: 503 });
  }
  if (result.ok) {
    logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'recovery.provision_new_instance',
      targetType: 'client_number',
      targetId:
        (result.json as { new_number_id?: string } | null)?.new_number_id ?? null,
      details: {
        old_number_id: oldNumberId,
        new_wa_number: newWaNumber,
        replacement_reason: reason,
      },
    });
  }
  return NextResponse.json(result.json as Record<string, unknown>, {
    status: result.status,
  });
}
