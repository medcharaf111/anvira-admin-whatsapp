import { NextResponse } from 'next/server';
import { requireCurrentClient } from '@/lib/client';

// Test personas defined client-side in /mock-phone — keep this list in sync.
const ALLOWED_MOCK_PHONES = new Set([
  '+971501111111',
  '+971502222222',
  '+971503333333',
]);

export async function POST(req: Request) {
  // Require an authenticated operator with a linked client. Without this,
  // anyone could POST to this endpoint and trigger LLM/Twilio costs against
  // the sandbox.
  await requireCurrentClient();

  const { phone, name, body } = await req.json();
  if (!phone || !body) {
    return NextResponse.json({ error: 'bad input' }, { status: 400 });
  }
  if (!ALLOWED_MOCK_PHONES.has(phone)) {
    return NextResponse.json({ error: 'phone_not_allowed' }, { status: 400 });
  }

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: phone, profile: { name } }],
              messages: [
                {
                  id: `mock_${crypto.randomUUID()}`,
                  from: phone,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const secret = process.env.WA_MOCK_SHARED_SECRET ?? 'dev-secret-change-me';
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/webhook/whatsapp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mock-secret': secret,
        },
        body: JSON.stringify(payload),
      }
    );
    return NextResponse.json({ ok: res.ok });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'backend unreachable: ' + err.message },
      { status: 502 }
    );
  }
}
