import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// 2.9 — Canonical doc-type vocabulary. Mirrors backend REQUEST_DOC_TYPES
// in webhook/internalRouter.ts AND the kyc_documents.doc_type DB CHECK
// constraint (migration 20260624). 'national_id' and 'source_of_funds'
// were DB-invalid — renamed to canonical values so a successful request
// can actually round-trip into a stored document row.
const VALID_DOC_TYPES = new Set([
  'passport',
  'emirates_id',
  'iqama_or_national_id',
  'proof_of_address',
  'aml_attestation',
  'source_of_funds_letter',
  'bank_statement',
  'salary_certificate',
]);

/**
 * POST /api/kyc/cases/:id/request-doc — send a WhatsApp message to the
 * customer asking for a specific missing document.
 *
 * Body: { doc_type: 'passport' | 'emirates_id' | ... }
 *
 * The backend composes the correct localized message body and sends
 * it through the existing WhatsApp pipeline, so the conversation
 * thread stays intact.
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
  if (!client.kyc_enabled) {
    return NextResponse.json({ error: 'kyc_disabled' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { doc_type?: string } | null;
  const docType = body?.doc_type ?? '';
  if (!VALID_DOC_TYPES.has(docType)) {
    return NextResponse.json({ error: 'invalid_doc_type' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, `/internal/kyc/cases/${id}/request-doc`, {
    method: 'POST',
    body: JSON.stringify({ doc_type: docType }),
  });
  if (!result.provisioned) {
    return NextResponse.json({ error: 'kyc_backend_not_provisioned' }, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json(
      (result.json as Record<string, unknown>) ?? { error: 'backend_error' },
      { status: result.status }
    );
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'kyc.case.request_doc',
    targetType: 'kyc_cases',
    targetId: id,
    details: { doc_type: docType },
  });
  return NextResponse.json(result.json);
}
