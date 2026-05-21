import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { NextResponse } from 'next/server';

/**
 * POST /api/kb/suggest
 *
 * Body:
 *   {
 *     field: string,                 // KB field key (e.g. "company_story")
 *     current?: Record<string, string>  // optional already-filled KB rows
 *   }
 *
 * Forwards to backend internal endpoint `/internal/kb/suggest` which
 * calls Gemini with the existing KB as context and returns:
 *   { suggestion: string }
 *
 * Contract notes:
 *   • Operator must be authed (admin layer enforces tenant scope).
 *   • Backend may rate-limit per client_id — if it returns 429 we pass
 *     that status through so the UI can show a toast.
 *   • `provisioned: false` means the backend hasn't deployed the
 *     endpoint yet → return 503 so the UI can fall back to a manual
 *     "AI Suggest unavailable" hint.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.field !== 'string' || !body.field.trim()) {
    return NextResponse.json({ error: 'field_required' }, { status: 400 });
  }

  // Pull the current KB so we can hand the backend the full context
  // without a second round-trip. If the caller already passed `current`,
  // trust it (the form may have unsaved edits the operator wants AI to
  // consider).
  let current: Record<string, unknown> = body.current ?? {};
  if (!body.current) {
    const { data: kb } = await supabase
      .from('knowledge_base')
      .select('*')
      .eq('client_id', client.id)
      .maybeSingle();
    current = (kb ?? {}) as Record<string, unknown>;
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, '/internal/kb/suggest', {
    method: 'POST',
    body: JSON.stringify({
      field: body.field,
      current,
      client_type: client.client_type,
      language: 'ar', // operator-facing draft; bot serves both AR + EN
    }),
  });

  if (!result.provisioned) {
    return NextResponse.json(
      { error: 'ai_suggest_unavailable' },
      { status: 503 }
    );
  }
  return NextResponse.json(result.json, { status: result.status });
}
