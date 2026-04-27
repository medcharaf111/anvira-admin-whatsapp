'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, StickyNote } from 'lucide-react';

/**
 * Operator-private notes attached to a conversation.
 * Auto-saves with a 1-second debounce after typing stops.
 */
export function NotesEditor({
  conversationId,
  initial,
}: {
  conversationId: string;
  initial: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const initRef = useRef(initial);

  useEffect(() => {
    if (value === initRef.current) return;
    setState('saving');
    const t = setTimeout(async () => {
      try {
        await fetch(`/api/conversations/${conversationId}/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: value }),
        });
        initRef.current = value;
        setState('saved');
        router.refresh();
        setTimeout(() => setState('idle'), 1500);
      } catch {
        setState('idle');
      }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, conversationId]);

  return (
    <div
      className="mb-6 p-4"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StickyNote
            className="w-3.5 h-3.5"
            strokeWidth={1.5}
            style={{ color: 'var(--ink-faint)' }}
          />
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          >
            ملاحظات داخلية · للمشغّل فقط
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {state !== 'idle' && (
            <motion.span
              key={state}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 text-[10px]"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              {state === 'saving' && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الحفظ
                </>
              )}
              {state === 'saved' && (
                <>
                  <Check className="w-3 h-3" style={{ color: 'var(--primary-glow)' }} />{' '}
                  محفوظ
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="مثلاً: عميل VIP، يفضّل المواعيد المسائية، حساس من الكلور..."
        className="w-full bg-transparent resize-y focus:outline-none text-sm leading-relaxed"
        style={{ color: 'var(--ink)', fontFamily: 'var(--font-body)' }}
      />
    </div>
  );
}
