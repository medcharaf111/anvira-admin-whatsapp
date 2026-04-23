import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { phone, name, body } = await req.json();
  if (!phone || !body) {
    return NextResponse.json({ error: 'bad input' }, { status: 400 });
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
