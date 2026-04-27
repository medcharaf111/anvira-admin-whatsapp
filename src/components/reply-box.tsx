'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Template {
  id: string;
  label: string;
  body: string;
  language: string;
}

export function ReplyBox({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Lazy-load templates the first time the picker opens
  useEffect(() => {
    if (!pickerOpen || templates.length > 0) return;
    fetch('/api/templates')
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => {});
  }, [pickerOpen, templates.length]);

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
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'send_failed');
    } finally {
      setSending(false);
    }
  }

  function insertTemplate(t: Template) {
    setValue((prev) => (prev.trim() ? `${prev}\n${t.body}` : t.body));
    setPickerOpen(false);
    setTimeout(() => ref.current?.focus(), 50);
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
      className="mt-3 relative"
    >
      <div
        className="flex items-end gap-2 p-3"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        {/* Templates picker trigger */}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-sm transition-colors"
          style={{
            background: pickerOpen ? 'var(--paper-hover)' : 'transparent',
            color: 'var(--ink-soft)',
            border: '1px solid var(--rule)',
          }}
          aria-label="ردود جاهزة"
          title="ردود جاهزة"
        >
          <FileText className="w-4 h-4" strokeWidth={1.5} />
        </button>

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

      {/* Templates dropdown */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 left-0 right-0 mt-2 max-h-72 overflow-y-auto p-2"
            style={{
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              borderRadius: '3px',
              boxShadow: '0 12px 32px -8px rgba(0,0,0,0.3)',
            }}
          >
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              >
                ردود جاهزة
              </span>
              <button
                onClick={() => setPickerOpen(false)}
                className="w-6 h-6 inline-flex items-center justify-center"
                style={{ color: 'var(--ink-faint)' }}
                aria-label="إغلاق"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {templates.length === 0 ? (
              <div
                className="text-xs px-3 py-4 text-center"
                style={{ color: 'var(--ink-soft)' }}
              >
                ما عندك ردود جاهزة بعد.
                <a
                  href="/templates"
                  className="link-anim mr-1.5"
                  style={{ color: 'var(--primary-glow)' }}
                >
                  أنشئ واحد
                </a>
              </div>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => insertTemplate(t)}
                      className="w-full text-right p-3 transition-colors"
                      style={{
                        background: 'transparent',
                        borderRadius: '3px',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--paper-hover)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      <div
                        className="text-xs font-semibold mb-0.5 flex items-center gap-2"
                        style={{ color: 'var(--ink)' }}
                      >
                        <span>{t.label}</span>
                        <span
                          className="text-[9px] px-1.5 py-0.5"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--ink-faint)',
                            border: '1px solid var(--rule)',
                            borderRadius: '2px',
                          }}
                        >
                          {t.language.toUpperCase()}
                        </span>
                      </div>
                      <div
                        className="text-xs line-clamp-2 leading-snug"
                        style={{ color: 'var(--ink-soft)' }}
                      >
                        {t.body}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
