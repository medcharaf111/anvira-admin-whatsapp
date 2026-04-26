import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { MessageThread } from '@/components/message-thread';
import { TakeoverToggle } from '@/components/takeover-toggle';
import { ReplyBox } from '@/components/reply-box';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await requireCurrentClient();
  const supabase = await createClient();

  const [{ data: convo }, { data: messages }] = await Promise.all([
    supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .eq('client_id', client.id)
      .single(),
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at'),
  ]);

  if (!convo) {
    return (
      <div className="panel p-8 text-center" style={{ color: 'var(--ink-soft)' }}>
        المحادثة غير موجودة
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/conversations"
        className="inline-flex items-center gap-2 text-xs mb-6 link-anim"
        style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
        <span>كل المحادثات</span>
      </Link>

      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="eyebrow">محادثة · LIVE</span>
          </div>
          <h1 className="display-ar text-2xl sm:text-3xl" style={{ color: 'var(--ink)' }}>
            {convo.customer_name || 'بدون اسم'}
          </h1>
          <p
            className="text-sm mt-1 tabular"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            dir="ltr"
          >
            {convo.customer_phone}
          </p>
        </div>
        <TakeoverToggle conversationId={id} initialPaused={convo.bot_paused} />
      </div>

      <MessageThread conversationId={id} initialMessages={messages ?? []} />

      <ReplyBox conversationId={id} />
    </div>
  );
}
