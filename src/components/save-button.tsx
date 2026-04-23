'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

interface SaveButtonProps {
  onSave: () => Promise<boolean>;
  idleLabel: string;
  savingLabel: string;
  savedLabel?: string;
  className?: string;
}

export function SaveButton({
  onSave,
  idleLabel,
  savingLabel,
  savedLabel = 'تمّ الحفظ',
  className,
}: SaveButtonProps) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');

  async function handle() {
    setState('saving');
    const ok = await onSave();
    if (ok) {
      setState('saved');
      setTimeout(() => setState('idle'), 1600);
    } else {
      setState('idle');
    }
  }

  return (
    <button
      onClick={handle}
      disabled={state !== 'idle'}
      className={`btn-primary h-10 px-6 ${className ?? ''}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-2"
        >
          {state === 'idle' && <span>{idleLabel}</span>}
          {state === 'saving' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{savingLabel}</span>
            </>
          )}
          {state === 'saved' && (
            <>
              <Check className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{savedLabel}</span>
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
