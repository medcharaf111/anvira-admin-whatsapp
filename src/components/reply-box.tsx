'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function ReplyBox({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function send() {
    const body = value.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'send_failed');
      }
      setValue('');
      ref.current?.focus();
      // Refresh server data so the new message appears even if
      // realtime subscription isn't firing
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'send_failed');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mt-3"
    >
      <div
        className="flex items-end gap-2 p-3"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="اكتب رداً للعميل..."
          rows={1}
          disabled={sending}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed focus:outline-none"
          style={{
            color: 'var(--ink)',
            fontFamily: 'var(--font-body)',
            maxHeight: '140px',
            minHeight: '38px',
            lineHeight: 1.5,
          }}
        />

        <button
          onClick={send}
          disabled={!value.trim() || sending}
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-sm transition-all"
          style={{
            background: value.trim() && !sending ? 'var(--primary-glow)' : 'var(--paper-sink)',
            color: value.trim() && !sending ? 'var(--paper)' : 'var(--ink-faint)',
            border: '1px solid var(--rule)',
            cursor: value.trim() && !sending ? 'pointer' : 'not-allowed',
          }}
          aria-label="إرسال"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4 rtl:-scale-x-100" strokeWidth={1.8} />
          )}
        </button>
      </div>

      {error && (
        <p
          className="mt-2 text-xs"
          style={{ color: 'var(--signal)', fontFamily: 'var(--font-mono)' }}
        >
          فشل الإرسال: {error}
        </p>
      )}

      <p
        className="mt-2 text-[10px]"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', letterSpacing: '0.06em' }}
      >
        ⏎ للإرسال · Shift+⏎ لسطر جديد · تُرسل كـ OPERATOR
      </p>
    </motion.div>
  );
}
