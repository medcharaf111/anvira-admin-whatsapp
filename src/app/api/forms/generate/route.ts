import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['A', 'B', 'F', 'I', 'U']);

/**
 * POST /api/forms/generate — proxies the backend's RERA form PDF
 * generator. The backend returns `{ url, expires_at }` where `url`
 * points at the temp-asset host. We pass the URL straight through;
 * the UI opens it in a new tab + triggers a download client-side.
 *
 * Body: `{ type: 'A'|'B'|'F'|'I'|'U', input: Record<string,unknown> }`.
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

  const body = (await req.json().catch(() => null)) as {
    type?: string;
    input?: Record<string, unknown>;
    autofill_audit?: {
      prefilled_field_names?: string[];
      edited_prefilled_field_names?: string[];
      prefilled_snapshot?: Record<string, unknown>;
    };
  } | null;

  const type = (body?.type ?? '').toUpperCase();
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }
  if (!body?.input || typeof body.input !== 'object') {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/rera/forms/generate', {
    method: 'POST',
    body: JSON.stringify({ type, input: body.input }),
  });

  if (!result.provisioned) {
    return NextResponse.json(
      { error: 'forms_backend_not_provisioned' },
      { status: 503 }
    );
  }
  if (!result.ok) {
    const j = (result.json as Record<string, unknown> | null) ?? {};
    return NextResponse.json(j, { status: result.status });
  }

  // Track F — audit log captures provenance + the diff between what we
  // suggested via auto-fill and what was actually signed off. For each
  // edited prefilled field we store {before: <auto-fill suggestion>,
  // after: <operator submission>} so a regulator can reconstruct intent.
  const audit = body.autofill_audit ?? {};
  const prefilled = Array.isArray(audit.prefilled_field_names) ? audit.prefilled_field_names : [];
  const edited = Array.isArray(audit.edited_prefilled_field_names) ? audit.edited_prefilled_field_names : [];
  const snapshot = audit.prefilled_snapshot ?? {};
  const fieldDiffs: Record<string, { before: unknown; after: unknown }> = {};
  for (const name of edited) {
    fieldDiffs[name] = {
      before: (snapshot as Record<string, unknown>)[name] ?? null,
      after: (body.input as Record<string, unknown>)[name] ?? null,
    };
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'rera.form.generate',
    targetType: 'rera_forms',
    targetId: null,
    details: {
      type,
      autofill_audit: {
        prefilled_count: prefilled.length,
        edited_count: edited.length,
        unchanged_count: prefilled.length - edited.length,
        diffs: fieldDiffs,
      },
    },
  });

  const payload = (result.json as Record<string, unknown> | null) ?? {};
  return NextResponse.json({ ok: true, ...payload });
}
