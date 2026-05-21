'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic } from 'lucide-react';

interface Msg {
  id: string;
  body: string;
  direction: 'inbound' | 'outbound';
  sender: 'customer' | 'bot' | 'human' | string;
  created_at: string;
  language?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Voice-note provenance detection — the backend orchestrator stamps
 * `metadata.voice = true` when the inbound message originated as a
 * WhatsApp voice note that was transcribed. As a defensive fallback we
 * also accept the older `metadata.reason === 'voice_transcribed'`
 * variant produced by earlier code paths. Document this in the report.
 */
function isVoiceTranscribed(m: Msg): boolean {
  if (!m.metadata) return false;
  const md = m.metadata as Record<string, unknown>;
  return md.voice === true || md.reason === 'voice_transcribed';
}

export function MessageThread({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-sync when the server re-fetches (after router.refresh() from reply).
  // Merge to preserve any message IDs we already have from realtime.
  useEffect(() => {
    setMessages((prev) => {
      const byId = new Map<string, Msg>();
      for (const m of prev) byId.set(m.id, m);
      for (const m of initialMessages) byId.set(m.id, m);
      return Array.from(byId.values()).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
    });
  }, [initialMessages]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}:${Date.now()}:${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.find((m) => m.id === (payload.new as Msg).id)
              ? prev
              : [...prev, payload.new as Msg]
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="h-[60dvh] overflow-y-auto px-6 py-6 space-y-1"
      style={{
        background: 'var(--paper-sink)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <AnimatePresence initial={false}>
        {messages.map((m, i) => {
          const isInbound = m.direction === 'inbound';
          const prevMsg = messages[i - 1];
          const showTime =
            !prevMsg ||
            new Date(m.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60_000;

          return (
            <div key={m.id}>
              {showTime && (
                <div className="flex justify-center my-4">
                  <span
                    className="text-[10px] tabular px-2"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {new Date(m.created_at).toLocaleString('ar-AE', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              )}
              <motion.div
                layout
                initial={{ opacity: 0, y: 8, x: isInbound ? -4 : 4 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'} py-1`}
              >
                {isInbound && isVoiceTranscribed(m) && (
                  <span
                    className="text-[9px] mb-1 px-1 flex items-center gap-1"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--primary-glow)',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <Mic className="w-2.5 h-2.5" strokeWidth={1.75} />
                    <span>
                      VOICE NOTE
                      {m.language ? ` · TRANSCRIBED FROM ${m.language.toUpperCase()}` : ' · TRANSCRIBED'}
                    </span>
                  </span>
                )}
                {!isInbound && m.sender === 'human' && (
                  <span
                    className="text-[9px] mb-1 px-1"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--primary-glow)',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    · OPERATOR
                  </span>
                )}
                <div
                  className="max-w-[75%] text-sm leading-relaxed px-3.5 py-2.5"
                  style={{
                    background: isInbound
                      ? 'var(--paper-lift)'
                      : m.sender === 'human'
                      ? 'var(--paper-lift)'
                      : 'color-mix(in srgb, var(--primary) 85%, var(--paper-sink) 15%)',
                    border:
                      isInbound || m.sender === 'human'
                        ? `1px solid ${m.sender === 'human' ? 'var(--primary-glow)' : 'var(--rule)'}`
                        : 'none',
                    color: 'var(--ink)',
                    borderRadius: isInbound ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                  }}
                >
                  {m.body}
                </div>
              </motion.div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div
            className="text-center py-10 text-sm"
            style={{ color: 'var(--ink-faint)' }}
          >
            لا توجد رسائل بعد.
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
