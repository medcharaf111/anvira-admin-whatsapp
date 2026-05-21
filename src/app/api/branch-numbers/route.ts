import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export interface BranchNumber {
  id: string;
  wa_number: string;
  label: string | null;
  is_primary: boolean;
}

/**
 * Branch-numbers proxy.
 *
 * GET   — list this client's WhatsApp numbers from backend.
 * POST  — add a new number (max 3 enforced server-side).
 *
 * The backend table `client_numbers` lands as part of Wave 2 backend
 * work. When it isn't provisioned yet, the endpoint either returns 404
 * or a structured "not provisioned" payload — we surface that as a
 * graceful empty state rather than crashing the settings page.
 */
export async function GET() {
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

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;

  if (!backend || !secret) {
    // The settings panel knows how to render "not provisioned" — surface
    // the same shape so the UX stays consistent in dev environments.
    return NextResponse.json({ numbers: [], provisioned: false });
  }

  try {
    const res = await fetch(`${backend}/internal/client-numbers`, {
      headers: {
        'X-Internal-Secret': secret,
        'X-Client-Id': client.id,
      },
      cache: 'no-store',
    });
    if (res.status === 404) {
      // Backend hasn't migrated yet — degrade gracefully.
      return NextResponse.json({ numbers: [], provisioned: false });
    }
    if (!res.ok) {
      return NextResponse.json(
        { numbers: [], provisioned: false, error: `backend_${res.status}` },
        { status: 200 }
      );
    }
    const json = (await res.json()) as { numbers?: BranchNumber[] };
    return NextResponse.json({
      numbers: json.numbers ?? [],
      provisioned: true,
    });
  } catch {
    return NextResponse.json({ numbers: [], provisioned: false });
  }
}

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

  const body = (await req.json().catch(() => null)) as
    | { wa_number?: string; label?: string }
    | null;
  if (!body?.wa_number?.trim()) {
    return NextResponse.json({ error: 'missing_wa_number' }, { status: 400 });
  }

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json({ error: 'backend_not_configured' }, { status: 500 });
  }

  const res = await fetch(`${backend}/internal/client-numbers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
      'X-Client-Id': client.id,
    },
    body: JSON.stringify({
      wa_number: body.wa_number.trim(),
      label: body.label?.trim() || null,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'branch_number.create',
    targetType: 'client_numbers',
    targetId: (json as { id?: string }).id ?? null,
    details: { wa_number: body.wa_number.trim() },
  });

  return NextResponse.json(json);
}
