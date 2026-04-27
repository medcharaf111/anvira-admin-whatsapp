const REASON_LABELS: Record<string, string> = {
  complaint: 'شكوى',
  explicit_request: 'طلب تحويل',
  unknown_answer: 'إجابة غير متوفرة',
  complex: 'طلب معقّد',
  after_hours: 'خارج العمل',
};

interface Row {
  reason: string;
  count: number;
}

export function HandoffBreakdown({ data }: { data: Row[] }) {
  const total = data.reduce((s, r) => s + r.count, 0);

  return (
    <div
      className="p-5"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          أسباب التحويل اليدوي
        </h3>
        <div
          className="text-[10px] uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          30 DAYS
        </div>
      </div>

      {data.length === 0 ? (
        <p
          className="text-xs text-center py-8"
          style={{ color: 'var(--ink-soft)' }}
        >
          لا تنبيهات في الفترة الأخيرة. البوت يدير كل المحادثات.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => {
            const pct = total > 0 ? (r.count / total) * 100 : 0;
            return (
              <li key={r.reason}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </span>
                  <span
                    className="text-xs tabular"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {r.count} · {pct.toFixed(0)}%
                  </span>
                </div>
                <div
                  className="h-1 w-full"
                  style={{ background: 'var(--paper-sink)', borderRadius: '1px' }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      background: 'var(--primary-glow)',
                      width: `${pct}%`,
                      borderRadius: '1px',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
