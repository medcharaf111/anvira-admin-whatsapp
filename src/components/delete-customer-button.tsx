'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

/**
 * GDPR-style "delete this customer" button — wipes the customer's
 * messages, conversation, bookings (and associated Google Calendar
 * events), handoffs, and blocklist entry within this client's scope.
 *
 * Two-step confirmation: typed phone number must match.
 */
export function DeleteCustomerButton({
  customerPhone,
}: {
  customerPhone: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  async function execute() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/customers/delete?phone=${encodeURIComponent(customerPhone)}`,
        { method: 'DELETE' }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`فشل: ${j.error ?? 'unknown'}`);
        return;
      }
      // After success, send the operator back to the conversations list
      router.push('/conversations');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="btn-ghost h-9 gap-2 text-xs"
        style={{ borderColor: 'var(--rule)', color: 'var(--ink-faint)' }}
        title="حذف كل بيانات هذا العميل (GDPR)"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span>حذف بياناته</span>
      </button>
    );
  }

  const matches = typed.trim() === customerPhone.trim();

  return (
    <div
      className="absolute mt-2 z-30 p-4 max-w-md shadow-lg"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--signal)',
        borderRadius: '3px',
        right: 0,
        top: '100%',
      }}
    >
      <div
        className="text-sm font-semibold mb-2"
        style={{ color: 'var(--signal)' }}
      >
        حذف نهائي — لا يمكن التراجع
      </div>
      <p
        className="text-xs leading-relaxed mb-3"
        style={{ color: 'var(--ink-soft)' }}
      >
        سيتم حذف كل رسائل العميل، تنبيهاته، مواعيده، وأحداث Google Calendar
        المرتبطة. اكتب رقم العميل للتأكيد:
      </p>
      <p
        className="text-[11px] tabular mb-2"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        dir="ltr"
      >
        {customerPhone}
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={customerPhone}
        dir="ltr"
        className="input-boxed text-left mb-3"
        style={{ fontFamily: 'var(--font-mono)' }}
        autoFocus
      />
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => {
            setConfirming(false);
            setTyped('');
          }}
          className="btn-ghost h-9 text-xs"
        >
          إلغاء
        </button>
        <button
          onClick={execute}
          disabled={!matches || busy}
          className="btn-signal h-9 gap-2 text-xs disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          <span>حذف نهائي</span>
        </button>
      </div>
    </div>
  );
}
