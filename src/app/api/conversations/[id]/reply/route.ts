import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Require an authenticated operator with a client
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const client = await getCurrentClient();
  if (!client) {
    return NextResponse.json({ error: 'no_client' }, { status: 403 });
  }

  // 2. Parse body
  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  if (!body || typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'missing_body' }, { status: 400 });
  }

  // 3. Forward to backend with shared secret
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json(
      { error: 'backend_not_configured' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${backend}/internal/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
        'X-Client-Id': client.id,
      },
      body: JSON.stringify({ conversation_id: id, body }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: 'backend_error', detail },
        { status: res.status }
      );
    }

    const json = await res.json();
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'backend_unreachable', detail: err?.message ?? String(err) },
      { status: 502 }
    );
  }
}
