import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kyc/cases/:id — case detail (joins documents + screening log).
 * PATCH /api/kyc/cases/:id — update status, notes.
 */
export async function GET(
  _req: NextRequest,
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

  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, `/internal/kyc/cases/${id}`, { method: 'GET' });
  if (!result.provisioned) {
    return NextResponse.json({ provisioned: false }, { status: 200 });
  }
  if (!result.ok) {
    return NextResponse.json(
      (result.json as Record<string, unknown>) ?? { error: 'backend_error' },
      { status: result.status }
    );
  }

  // Backend returns `{ok, case, documents, screenings}`; the drawer
  // expects a flat shape with renamed fields (nationality vs
  // customer_nationality, pep_self_declared vs pep_declared,
  // screening_log vs screenings) plus a derived required_doc_types
  // list. Normalize here so the drawer's interface stays stable even
  // when backend evolves. Falls through unchanged if the backend ever
  // ships the flat shape directly.
  const raw = (result.json as Record<string, unknown> | null) ?? {};
  if (raw.case && typeof raw.case === 'object') {
    const c = raw.case as Record<string, unknown>;
    const docs = Array.isArray(raw.documents) ? raw.documents : [];
    const screenings = Array.isArray(raw.screenings) ? raw.screenings : [];
    const amount = typeof c.expected_purchase_amount === 'number'
      ? c.expected_purchase_amount
      : 0;
    // 2.9 — Mirror backend's buildChecklist() in src/kyc/types.ts. Kept
    // here so the admin layer doesn't need a backend round-trip to
    // populate the document request UI. Update both in lockstep.
    // Canonical doc-type vocabulary lives in migration
    // 20260624000000_kyc_doc_type_expand.sql.
    const required: string[] = [
      'passport',
      'emirates_id',
      'bank_statement',
      'proof_of_address',
      'aml_attestation',
    ];
    if (amount >= 1_000_000) required.push('source_of_funds_letter');

    // Pass through the backend's latest_buyer_budget snapshot. The
    // drawer compares it against expected_purchase_amount and renders
    // a "buyer mentioned X in conversation — apply?" nudge when they
    // diverge. Null when there's no linked conversation, no joined
    // leads_qualification row, or no extracted budget yet.
    const lbb =
      raw.latest_buyer_budget && typeof raw.latest_buyer_budget === 'object'
        ? (raw.latest_buyer_budget as Record<string, unknown>)
        : null;
    const latest_buyer_budget = lbb
      ? {
          amount: typeof lbb.amount === 'number' ? lbb.amount : null,
          currency: typeof lbb.currency === 'string' ? lbb.currency : null,
          last_extracted_at:
            typeof lbb.last_extracted_at === 'string'
              ? lbb.last_extracted_at
              : null,
        }
      : null;

    const flat = {
      id: c.id,
      customer_name: c.customer_name ?? null,
      customer_phone: c.customer_phone,
      nationality: c.customer_nationality ?? null,
      pep_self_declared: c.pep_declared ?? null,
      source_of_funds: c.source_of_funds ?? null,
      expected_purchase_amount: c.expected_purchase_amount ?? null,
      expected_purchase_currency: c.expected_purchase_currency ?? null,
      latest_buyer_budget,
      status: c.status,
      notes: c.notes ?? null,
      // Track D additions — exposed to the drawer so the CDD section
      // can render them once that UI lands.
      date_of_birth: c.date_of_birth ?? null,
      funding_source_type: c.funding_source_type ?? null,
      is_entity: c.is_entity ?? false,
      beneficial_owner_name: c.beneficial_owner_name ?? null,
      intended_use: c.intended_use ?? null,
      documents: docs.map((d) => {
        const dd = d as Record<string, unknown>;
        return {
          id: dd.id,
          doc_type: dd.doc_type,
          filename: dd.original_filename ?? null,
          preview_url: dd.storage_url ?? null,
          download_url: dd.storage_url ?? null,
          uploaded_at: dd.received_at ?? null,
        };
      }),
      screening_log: screenings.map((s) => {
        const ss = s as Record<string, unknown>;
        return {
          id: ss.id,
          ran_at: ss.screened_at,
          // Coerce backend's canonical result strings to the drawer's
          // vocabulary so the chip renders correctly. 'not_screened' (no
          // provider configured — remediation C2) maps to its own honest
          // chip, NOT 'error', so the operator sees "screening not run"
          // rather than a retryable failure.
          result:
            ss.result === 'clear'
              ? 'clean'
              : ss.result === 'confirmed_match'
              ? 'match'
              : ss.result === 'possible_match'
              ? 'review_needed'
              : ss.result === 'not_screened'
              ? 'not_screened'
              : 'error',
          matched_lists: extractMatchedLists(ss.raw_response),
          notes: null,
        };
      }),
      required_doc_types: required,
    };
    return NextResponse.json(flat);
  }

  return NextResponse.json(raw);
}

/** Pulls the unique source labels out of the raw_response.matches array
 *  for the chip row on the drawer. Tolerates the older stub shape that
 *  put dataset names elsewhere — anything not understood returns []. */
function extractMatchedLists(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  const matches = Array.isArray(r.matches) ? r.matches : [];
  const out = new Set<string>();
  for (const m of matches) {
    const src = (m as Record<string, unknown>).source;
    if (typeof src === 'string') out.add(src);
  }
  return Array.from(out);
}

// Mirror the backend's whitelist (src/webhook/internalRouter.ts).
// Includes Track D CDD fields the drawer's editor surfaces. Backend
// still validates each value at the DB layer (CHECK constraints +
// enum sets) — this list is just the surface area the admin allows.
const ALLOWED_PATCH = [
  'status',
  'notes',
  'date_of_birth',
  'funding_source_type',
  'is_entity',
  'beneficial_owner_name',
  'intended_use',
  'customer_name',
  'customer_nationality',
  'pep_declared',
  'source_of_funds',
  'expected_purchase_amount',
  'expected_purchase_currency',
] as const;

export async function PATCH(
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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH) if (body[k] !== undefined) updates[k] = body[k];
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  // Generic PATCH endpoint on the backend (added with Track D admin
  // polish) handles all whitelisted field updates including status
  // changes. The dedicated POST /status route still exists for the
  // drawer's status quick-buttons but we route everything through
  // PATCH from here for uniformity.
  const ctx = getInternalContext(client.id);
  const result = await callInternal(ctx, `/internal/kyc/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (!result.provisioned) {
    return NextResponse.json({ error: 'kyc_backend_not_provisioned' }, { status: 503 });
  }
  if (!result.ok) {
    // Surface the CDD-completion-gate violation with a friendly,
    // operator-actionable shape so the drawer can render
    // "needs date_of_birth, funding_source_type, intended_use" instead of
    // a generic 500. Other DB errors fall through verbatim.
    const j = (result.json as Record<string, unknown> | null) ?? {};
    const detail = String(j.detail ?? '');
    if (j.error === 'db_failed' && detail.includes('kyc_cases_cdd_minimum')) {
      return NextResponse.json(
        {
          error: 'cdd_incomplete',
          detail:
            'Status promotion blocked: case is missing required CDD fields. ' +
            'Fill date_of_birth, funding_source_type, intended_use ' +
            '(and beneficial_owner_name when is_entity=true) before promoting.',
          missing_hint: [
            'date_of_birth',
            'funding_source_type',
            'intended_use',
            'beneficial_owner_name (when is_entity)',
          ],
        },
        { status: 422 }
      );
    }
    return NextResponse.json(j, { status: result.status });
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'kyc.case.update',
    targetType: 'kyc_cases',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });
  return NextResponse.json(result.json);
}
