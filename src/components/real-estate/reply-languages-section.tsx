'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Languages, Info, Check, Loader2 } from 'lucide-react';

type LangCode = 'ar' | 'en' | 'fr' | 'ru' | 'hi' | 'ur' | 'zh';

interface LangMeta {
  code: LangCode;
  flag: string;
  ar: string;
  en: string;
  /** Cannot be unchecked alone — at least one must remain checked. */
  primary?: boolean;
}

const LANGUAGES: LangMeta[] = [
  { code: 'ar', flag: 'العربية', ar: 'العربية',     en: 'Arabic',   primary: true },
  { code: 'en', flag: 'EN',     ar: 'الإنجليزية',  en: 'English',  primary: true },
  { code: 'fr', flag: 'FR',     ar: 'الفرنسية',    en: 'French'    },
  { code: 'ru', flag: 'RU',     ar: 'الروسية',     en: 'Russian'   },
  { code: 'hi', flag: 'HI',     ar: 'الهندية',     en: 'Hindi'     },
  { code: 'ur', flag: 'UR',     ar: 'الأردو',      en: 'Urdu'      },
  { code: 'zh', flag: '中文',    ar: 'المندرين',    en: 'Mandarin'  },
];

interface LangResponse {
  enabled: LangCode[];
  supported: LangCode[];
  deferred: boolean;
}

/**
 * Reply-language opt-in panel — RE only.
 *
 * When the operator unchecks a language, inbound messages detected in
 * that language will trigger a human handoff with reason
 * `unknown_answer` instead of an auto-reply. AR + EN are checked by
 * default and can't both be unchecked.
 *
 * Persistence: writes to dashboard_clients.enabled_languages. If the
 * column hasn't been migrated yet, the POST returns deferred:true and
 * we surface a "preference saved — bot wiring activates after next
 * deploy" toast so the operator gets honest feedback.
 */
export function ReplyLanguagesSection() {
  const [enabled, setEnabled] = useState<Set<LangCode>>(new Set(['ar', 'en']));
  const [initialEnabled, setInitialEnabled] = useState<Set<LangCode>>(new Set(['ar', 'en']));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deferred, setDeferred] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/languages', { cache: 'no-store' });
        if (!res.ok) throw new Error('failed');
        const j = (await res.json()) as LangResponse;
        const set = new Set(j.enabled);
        setEnabled(set);
        setInitialEnabled(new Set(j.enabled));
        setDeferred(j.deferred);
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(code: LangCode) {
    const next = new Set(enabled);
    if (next.has(code)) {
      // Don't allow disabling both AR and EN at once.
      const wouldBeEmpty = next.size === 1;
      const onlyOtherPrimary =
        (code === 'ar' && !next.has('en')) || (code === 'en' && !next.has('ar'));
      if (wouldBeEmpty) {
        toast.error('يجب الإبقاء على لغة واحدة على الأقل');
        return;
      }
      if (onlyOtherPrimary && (code === 'ar' || code === 'en')) {
        // Allow disabling one primary as long as the other primary
        // is still checked.
        const otherPrimary = code === 'ar' ? 'en' : 'ar';
        if (!next.has(otherPrimary)) {
          toast.error('يجب الإبقاء على العربية أو الإنجليزية');
          return;
        }
      }
      next.delete(code);
    } else {
      next.add(code);
    }
    setEnabled(next);
  }

  const dirty =
    enabled.size !== initialEnabled.size ||
    Array.from(enabled).some((c) => !initialEnabled.has(c));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: Array.from(enabled) }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deferred?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error(
          j.error === 'must_keep_ar_or_en'
            ? 'يجب الإبقاء على العربية أو الإنجليزية'
            : 'تعذّر الحفظ'
        );
        return;
      }
      if (j.deferred) {
        toast.success(
          'حُفظت التفضيلات — تفعيل البوت بعد التحديث القادم'
        );
      } else {
        toast.success('تم حفظ لغات الردّ');
      }
      setInitialEnabled(new Set(enabled));
      setDeferred(!!j.deferred);
    } catch {
      toast.error('تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-12">
      <div className="mb-8 flex items-start gap-3">
        <Languages
          className="w-5 h-5 mt-0.5 shrink-0"
          style={{ color: 'var(--primary-glow)' }}
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-xl font-medium" style={{ color: 'var(--ink)' }}>
              لغات الردّ
            </h2>
            <span
              className="text-[11px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
              }}
            >
              Reply languages · {enabled.size}/{LANGUAGES.length}
            </span>
          </div>
          <p
            className="text-sm mt-1.5 max-w-2xl"
            style={{ color: 'var(--ink-soft)' }}
          >
            اختر اللغات التي يردّ بها المساعد تلقائياً. أي رسالة بلغة معطّلة
            تُحوَّل لمشغّل بشري بدلاً من ردّ آلي.
          </p>
        </div>
      </div>

      <div
        className="p-6 md:p-7"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        {loading ? (
          <div className="py-6 flex items-center justify-center">
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: 'var(--ink-faint)' }}
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {LANGUAGES.map((l) => (
                <LangChip
                  key={l.code}
                  meta={l}
                  checked={enabled.has(l.code)}
                  onToggle={() => toggle(l.code)}
                />
              ))}
            </div>

            <div
              className="p-3.5 flex items-start gap-2.5"
              style={{
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: 3,
              }}
            >
              <Info
                className="w-3.5 h-3.5 mt-0.5 shrink-0"
                style={{ color: 'var(--ink-faint)' }}
              />
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: 'var(--ink-soft)' }}
              >
                مثال: إذا عطّلت «المندرين» وجاءت رسالة بالصينية، سيُسجَّل تنبيه
                handoff تلقائياً بسبب{' '}
                <code
                  className="px-1 py-0.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--paper-lift)',
                    border: '1px solid var(--rule)',
                    borderRadius: 2,
                    fontSize: '0.7rem',
                  }}
                  dir="ltr"
                >
                  unknown_answer
                </code>{' '}
                مع ملاحظة أن العميل كتب بلغة معطّلة.
              </p>
            </div>

            {deferred && (
              <div
                className="p-3.5 flex items-start gap-2.5"
                style={{
                  background: 'var(--warn-soft)',
                  border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
                  borderRadius: 3,
                }}
              >
                <Info
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  style={{ color: 'var(--warn)' }}
                />
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  تفضيلات اللغات تُحفَظ مؤقتاً — سيُفعَّل ربط البوت بعد التحديث
                  القادم من الخلفية.
                </p>
              </div>
            )}

            <div
              className="pt-4 flex items-center justify-end gap-3"
              style={{ borderTop: '1px solid var(--rule)' }}
            >
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="btn-primary h-10 gap-2 text-sm"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>حفظ لغات الردّ</span>
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

function LangChip({
  meta,
  checked,
  onToggle,
}: {
  meta: LangMeta;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={checked}
      className="flex items-center gap-2.5 px-3.5 h-11 text-right transition-colors"
      style={{
        background: checked ? 'var(--primary-soft)' : 'var(--paper-sink)',
        border: `1px solid ${checked ? 'color-mix(in srgb, var(--primary-glow) 40%, transparent)' : 'var(--rule)'}`,
        borderRadius: 3,
        color: checked ? 'var(--ink)' : 'var(--ink-soft)',
      }}
    >
      <span
        className="w-4 h-4 flex items-center justify-center shrink-0"
        style={{
          background: checked ? 'var(--primary-glow)' : 'transparent',
          border: `1px solid ${checked ? 'var(--primary-glow)' : 'var(--rule-strong)'}`,
          borderRadius: 2,
        }}
      >
        {checked && (
          <Check
            className="w-2.5 h-2.5"
            strokeWidth={3}
            style={{ color: 'var(--paper)' }}
          />
        )}
      </span>
      <span
        className="text-[10px] tabular shrink-0 px-1.5 py-0.5"
        style={{
          fontFamily: 'var(--font-mono)',
          background: 'var(--paper-lift)',
          color: 'var(--ink-faint)',
          border: '1px solid var(--rule)',
          borderRadius: 2,
          letterSpacing: '0.06em',
        }}
      >
        {meta.code.toUpperCase()}
      </span>
      <span className="text-[13px] truncate flex-1 min-w-0">{meta.ar}</span>
    </button>
  );
}
