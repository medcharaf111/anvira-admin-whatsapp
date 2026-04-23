'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function AlertResolveButton({ handoffId }: { handoffId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const router = useRouter();

  async function resolve() {
    setState('loading');
    const res = await fetch(`/api/handoffs/${handoffId}/resolve`, { method: 'POST' });
    if (res.ok) {
      setState('done');
      setTimeout(() => router.refresh(), 500);
    } else {
      setState('idle');
    }
  }

  return (
    <button
      onClick={resolve}
      disabled={state !== 'idle'}
      className="btn-primary h-9 text-xs px-3.5 gap-1.5"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-1.5"
        >
          {state === 'idle' && (
            <>
              <Check className="w-3.5 h-3.5" strokeWidth={2} />
              <span>حلّ</span>
            </>
          )}
          {state === 'loading' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>جارٍ...</span>
            </>
          )}
          {state === 'done' && (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>تمّ</span>
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
