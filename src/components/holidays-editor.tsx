'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Loader2, CalendarOff } from 'lucide-react';

interface Holiday {
  id: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string;
  label: string | null;
}

function fmtRangeAr(starts: string, ends: string): string {
  const startD = new Date(`${starts}T00:00:00`).toLocaleDateString('ar-AE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  if (starts === ends) return startD;
  const endD = new Date(`${ends}T00:00:00`).toLocaleDateString('ar-AE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${startD} — ${endD}`;
}

export function HolidaysEditor() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/holidays', { cache: 'no-store' });
      const j = await res.json();
      if (res.ok) setHolidays(j.holidays ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    setError(null);
    if (!startsOn || !endsOn) {
      setError('عبّي تاريخ البداية والنهاية');
      return;
    }
    if (endsOn < startsOn) {
      setError('تاريخ النهاية يجب أن يكون بعد البداية');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        starts_on: startsOn,
        ends_on: endsOn,
        label: label.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(`فشل: ${j.error ?? 'unknown'}`);
      return;
    }
    setStartsOn('');
    setEndsOn('');
    setLabel('');
    setAdding(false);
    void load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
    if (res.ok) setHolidays((h) => h.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          جاري التحميل...
        </div>
      ) : holidays.length === 0 && !adding ? (
        <div
          className="text-sm py-6 px-4"
          style={{
            color: 'var(--ink-faint)',
            border: '1px dashed var(--rule)',
            borderRadius: '3px',
          }}
        >
          لا عطل مسجّلة. أضف الأعياد والإجازات حتى لا يحجز البوت بهالأيام.
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {holidays.map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="flex items-center justify-between px-4 py-3"
                style={{
                  background: 'var(--paper-lift)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CalendarOff
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--signal)' }}
                    strokeWidth={1.5}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-sm tabular truncate"
                      style={{ color: 'var(--ink)' }}
                    >
                      {fmtRangeAr(h.starts_on, h.ends_on)}
                    </div>
                    {h.label && (
                      <div
                        className="text-[11px] truncate mt-0.5"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        {h.label}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => remove(h.id)}
                  className="btn-ghost h-9 w-9 p-0 shrink-0"
                  aria-label="حذف"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {adding ? (
        <div
          className="space-y-3 p-4"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label mb-1.5 block">من</span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => {
                  setStartsOn(e.target.value);
                  // Auto-fill ends_on with same date for single-day holidays
                  if (!endsOn || endsOn < e.target.value) setEndsOn(e.target.value);
                }}
                className="input-boxed h-11 w-full"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </label>
            <label className="block">
              <span className="field-label mb-1.5 block">إلى</span>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                min={startsOn || undefined}
                className="input-boxed h-11 w-full"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </label>
          </div>
          <label className="block">
            <span className="field-label mb-1.5 block">السبب (اختياري)</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="عيد الأضحى، صيانة، إجازة الفريق..."
              className="input-boxed h-11 w-full"
            />
          </label>
          {error && (
            <div
              className="text-xs p-2"
              style={{
                background: 'var(--signal-soft)',
                border: '1px solid var(--signal)',
                color: 'var(--signal)',
                borderRadius: '3px',
              }}
            >
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => {
                setAdding(false);
                setStartsOn('');
                setEndsOn('');
                setLabel('');
                setError(null);
              }}
              className="btn-ghost h-10 px-4 text-sm"
            >
              إلغاء
            </button>
            <button
              onClick={add}
              disabled={saving}
              className="btn-primary h-10 px-5 text-sm gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>إضافة</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="btn-ghost h-10 px-4 text-sm gap-2"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span>إضافة عطلة</span>
        </button>
      )}
    </div>
  );
}
