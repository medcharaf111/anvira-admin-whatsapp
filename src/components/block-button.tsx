'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2, ShieldOff } from 'lucide-react';

export function BlockButton({
  customerPhone,
  isBlocked,
}: {
  customerPhone: string;
  isBlocked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    if (
      !confirm(
        isBlocked
          ? 'إلغاء حظر هذا الرقم؟ سيتمكن البوت من الرد على رسائله مجدداً.'
          : 'حظر هذا الرقم؟ سيتم تجاهل كل رسائله القادمة.'
      )
    )
      return;
    setBusy(true);
    try {
      const res = isBlocked
        ? await fetch(
            `/api/customers/block?phone=${encodeURIComponent(customerPhone)}`,
            { method: 'DELETE' }
          )
        : await fetch('/api/customers/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_phone: customerPhone }),
          });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`فشل: ${j.error ?? 'unknown'}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={isBlocked ? 'btn-ghost h-9 gap-2 text-xs' : 'btn-ghost h-9 gap-2 text-xs'}
      style={
        isBlocked
          ? { borderColor: 'var(--signal)', color: 'var(--signal)' }
          : undefined
      }
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isBlocked ? (
        <ShieldOff className="w-3.5 h-3.5" />
      ) : (
        <Ban className="w-3.5 h-3.5" />
      )}
      <span>{isBlocked ? 'إلغاء الحظر' : 'حظر الرقم'}</span>
    </button>
  );
}
