'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { fadeSwap } from '@/lib/motion';

export function TakeoverToggle({
  conversationId,
  initialPaused,
}: {
  conversationId: string;
  initialPaused: boolean;
}) {
  const [paused, setPaused] = useState(initialPaused);
  const [loading, setLoading] = useState(false);

  async function toggle(next: boolean) {
    setLoading(true);
    const res = await fetch(`/api/conversations/${conversationId}/takeover`, {
      method: 'POST',
      body: JSON.stringify({ paused: next }),
    });
    setLoading(false);
    if (!res.ok) return toast.error('ما قدرنا نحدّث');
    setPaused(next);
    toast.success(next ? 'تم إيقاف البوت. أنت ترد الآن.' : 'تم استئناف البوت.');
  }

  return (
    <motion.div
      layout
      className={`flex items-center gap-3 bg-card border rounded-xl px-4 py-3 transition-colors duration-300
        ${paused ? 'border-destructive/50 shadow-[0_0_0_3px_hsl(var(--destructive)/0.08)]' : 'border-border'}`}
    >
      <Switch
        id="takeover"
        checked={paused}
        onCheckedChange={toggle}
        disabled={loading}
      />
      <Label htmlFor="takeover" className="text-base cursor-pointer min-w-[6rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={paused ? 'paused' : 'active'}
            variants={fadeSwap}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="inline-block"
          >
            {paused ? 'أرد يدوياً' : 'البوت يرد'}
          </motion.span>
        </AnimatePresence>
      </Label>
    </motion.div>
  );
}
