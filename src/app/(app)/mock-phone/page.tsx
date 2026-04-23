'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { spring } from '@/lib/motion';

const PERSONAS = [
  { name: 'Ahmed', phone: '+971501111111' },
  { name: 'Fatima', phone: '+971502222222' },
  { name: 'Omar', phone: '+971503333333' },
];

interface Msg {
  id: string;
  body: string;
  direction: 'inbound' | 'outbound';
  created_at: string;
}

export default function MockPhonePage() {
  const [persona, setPersona] = useState(PERSONAS[0]);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: convo } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_phone', persona.phone)
        .maybeSingle();
      if (cancelled) return;

      if (convo) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('id, body, direction, created_at')
          .eq('conversation_id', convo.id)
          .order('created_at');
        if (cancelled) return;
        setMessages((msgs as Msg[]) ?? []);

        // Unique name per mount — prevents supabase-js from returning a cached subscribed channel
        channel = supabase
          .channel(`mock:${convo.id}:${Date.now()}:${Math.random()}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=eq.${convo.id}`,
            },
            (payload) =>
              setMessages((prev) => {
                const next = payload.new as Msg;
                return prev.find((m) => m.id === next.id) ? prev : [...prev, next];
              })
          )
          .subscribe();
      } else {
        setMessages([]);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [persona]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await fetch('/api/mock/send', {
      method: 'POST',
      body: JSON.stringify({
        phone: persona.phone,
        name: persona.name,
        body: text,
      }),
    });
    setSending(false);
    if (res.ok) setText('');
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold mb-1">هاتف التجربة</h1>
      <p className="text-muted-foreground mb-6">
        جرّب مساعدك من منظور العميل. اختر شخصية وابدأ الدردشة.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {PERSONAS.map((p) => (
          <motion.div key={p.phone} whileTap={{ scale: 0.96 }}>
            <Button
              variant={persona.phone === p.phone ? 'default' : 'outline'}
              onClick={() => setPersona(p)}
              className="h-11 transition-all"
            >
              {p.name}
            </Button>
          </motion.div>
        ))}
      </div>

      <Card className="max-w-md mx-auto bg-[#0c1f24] text-white p-0 overflow-hidden rounded-3xl shadow-2xl border-4 border-[#0c1f24]">
        <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center font-semibold">
            {persona.name[0]}
          </div>
          <div>
            <div className="font-medium">{persona.name}</div>
            <div className="text-xs opacity-80">{persona.phone}</div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="h-[55dvh] overflow-y-auto px-4 py-4 space-y-2 bg-[#0e2a30]"
        >
          <AnimatePresence initial={false}>
            {messages.map((m) => {
              const isBot = m.direction === 'outbound';
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{
                    opacity: 0,
                    y: 14,
                    scale: 0.94,
                    x: isBot ? -6 : 6,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                  transition={spring}
                  className={`flex ${
                    isBot ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-base shadow-md
                      ${
                        isBot
                          ? 'bg-white/10 text-white rounded-bl-sm'
                          : 'bg-emerald-600 text-white rounded-br-sm'
                      }`}
                  >
                    {m.body}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="bg-[#0c1f24] p-3 flex gap-2 border-t border-white/10">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="اكتب رسالة…"
            className="bg-white/10 border-white/10 text-white placeholder:text-white/40 h-11"
          />
          <Button
            onClick={send}
            disabled={sending}
            className="h-11 w-11 p-0"
            aria-label="إرسال"
          >
            <Send className="w-5 h-5 rtl:rotate-180" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
