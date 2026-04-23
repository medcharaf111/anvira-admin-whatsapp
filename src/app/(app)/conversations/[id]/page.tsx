import { createClient } from '@/lib/supabase/server';
import { MessageThread } from '@/components/message-thread';
import { TakeoverToggle } from '@/components/takeover-toggle';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: convo }, { data: messages }] = await Promise.all([
    supabase.from('conversations').select('*').eq('id', id).single(),
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at'),
  ]);

  if (!convo) return <div>غير موجود</div>;

  return (
    <div>
      <Link
        href="/conversations"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> كل المحادثات
      </Link>

      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">
            {convo.customer_name || convo.customer_phone}
          </h1>
          <p className="text-muted-foreground">{convo.customer_phone}</p>
        </div>
        <TakeoverToggle conversationId={id} initialPaused={convo.bot_paused} />
      </div>

      <MessageThread conversationId={id} initialMessages={messages ?? []} />
    </div>
  );
}
