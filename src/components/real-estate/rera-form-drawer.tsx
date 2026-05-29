'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  Loader2,
  Download,
  ExternalLink,
  Info,
  AlertCircle,
  FileText,
} from 'lucide-react';
import type { ReraFormType } from '@/components/real-estate/rera-forms-page';

type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'phone'
  | 'email'
  | 'select'
  | 'multiselect'
  | 'boolean';

interface FormField {
  name: string;
  type: FieldType;
  label_ar: string;
  label_en: string;
  required?: boolean;
  options?: Array<{ value: string; label_ar?: string; label_en?: string }>;
  placeholder?: string;
  helper?: string;
  group?: string;
}

interface FormSchema {
  type: ReraFormType;
  title_ar: string;
  title_en: string;
  fields: FormField[];
}

interface GenerateResponse {
  url?: string;
  expires_at?: string;
  error?: string;
  /** Machine warning codes from evaluateTransactionGate. */
  warnings?: string[];
  /** Human-readable factual lines surfaced to the operator. */
  notes?: string[];
  /** True on 409 — backend refuses without an override_reason. */
  requires_override?: boolean;
  /** Set on 422 — hard block, no override possible. */
  block_reason?: string;
}

/**
 * Dynamic RERA form drawer.
 *
 * Fetches the schema on open, renders fields grouped by their `group`
 * attribute (or "General" if missing), pre-populates from the parent's
 * `prefill` blob (matching by field `name`), then POSTs `{type, input}`
 * to the generate endpoint and opens the resulting ephemeral PDF URL
 * in a new tab plus triggers a download.
 *
 * Empty-state when the schema endpoint reports `provisioned: false`.
 */
export function ReraFormDrawer({
  open,
  type,
  prefill,
  leadId,
  propertyId,
  onClose,
}: {
  open: boolean;
  type: ReraFormType | null;
  prefill: Record<string, unknown>;
  leadId: string | null;
  propertyId: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [provisioned, setProvisioned] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  // Track F — auto-fill provenance.
  //   prefilledFields: field names that were originally seeded from prefill
  //     (these get the AUTO badge). A field stays in this set even after
  //     the operator edits it — it just gets added to editedPrefilledFields
  //     too, so the audit log records "was auto-filled, then edited."
  //   editedPrefilledFields: subset of prefilledFields that the operator
  //     has subsequently touched. Used by the audit log to show diff.
  //   reviewedConfirmed: the explicit "I have reviewed" gate — Generate
  //     stays disabled until the operator ticks it for THIS drawer session.
  //     Reset on each open so confirming once doesn't leak to next form.
  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set());
  const [editedPrefilledFields, setEditedPrefilledFields] = useState<Set<string>>(
    new Set()
  );
  const [reviewedConfirmed, setReviewedConfirmed] = useState(false);
  // Snapshot of the auto-filled values at hydrate time, kept so the audit
  // diff can compare "what we suggested" vs "what was submitted" without
  // re-querying.
  const [prefilledSnapshot, setPrefilledSnapshot] = useState<Record<string, unknown>>(
    {}
  );
  // Track E — RERA integrity gate. Two stages:
  //   - gateWarnings/gateNotes: latest backend gate output (warnings codes +
  //     factual lines). Shown as a banner whenever non-empty.
  //   - overrideRequired: true after a 409 from the backend. Reveals the
  //     override-reason textarea + confirm box; Generate stays disabled
  //     until the operator types a reason AND confirms the second gate.
  //   - blockReason: 422 hard-block code, e.g. F_DEPOSIT_EXCEEDS_PRICE.
  //     No override bypasses it — the textarea stays hidden.
  const [gateWarnings, setGateWarnings] = useState<string[]>([]);
  const [gateNotes, setGateNotes] = useState<string[]>([]);
  const [overrideRequired, setOverrideRequired] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch the schema whenever the drawer opens with a new type.
  useEffect(() => {
    if (!open || !type) return;
    let cancelled = false;
    setLoading(true);
    setGenerated(null);
    fetch(`/api/forms/schema?type=${encodeURIComponent(type)}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (j: ({ provisioned?: boolean } & Partial<FormSchema>) | null) => {
          if (cancelled) return;
          if (!j || j.provisioned === false || !Array.isArray(j.fields)) {
            setProvisioned(j?.provisioned !== false);
            setSchema(null);
            if (j && j.provisioned === false) setProvisioned(false);
            return;
          }
          setProvisioned(true);
          setSchema({
            type: type as ReraFormType,
            title_ar: j.title_ar ?? '',
            title_en: j.title_en ?? '',
            fields: j.fields as FormField[],
          });
        }
      )
      .catch(() => {
        if (!cancelled) {
          setSchema(null);
          setProvisioned(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, type]);

  // Whenever the schema or prefill changes, hydrate the form values.
  // Operator-typed values take priority once they exist — we only seed
  // empty fields from prefill. Also tracks which field names were
  // populated from prefill so the renderer can show the AUTO badge.
  useEffect(() => {
    if (!schema) {
      setValues({});
      setPrefilledFields(new Set());
      setPrefilledSnapshot({});
      return;
    }
    setValues((current) => {
      const next = { ...current };
      const seeded = new Set<string>();
      const snapshot: Record<string, unknown> = {};
      for (const f of schema.fields) {
        if (next[f.name] !== undefined) continue;
        if (Object.prototype.hasOwnProperty.call(prefill, f.name)) {
          const v = prefill[f.name];
          if (v !== null && v !== undefined && v !== '') {
            next[f.name] = v;
            seeded.add(f.name);
            snapshot[f.name] = v;
          }
        }
      }
      // Replace state only if we actually seeded anything new; otherwise
      // a re-render shouldn't reset the badges the operator has already
      // dismissed by editing.
      if (seeded.size > 0) {
        setPrefilledFields((curr) => new Set([...curr, ...seeded]));
        setPrefilledSnapshot((curr) => ({ ...curr, ...snapshot }));
      }
      return next;
    });
  }, [schema, prefill]);

  // Each new open() resets the review-confirm gate so confirming once
  // doesn't leak across form generations.
  useEffect(() => {
    if (open) {
      setReviewedConfirmed(false);
      // RERA gate state — wipe so a prior 409/422 doesn't bleed into the
      // next drawer session.
      setGateWarnings([]);
      setGateNotes([]);
      setOverrideRequired(false);
      setOverrideReason('');
      setOverrideConfirmed(false);
      setBlockReason(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const groupedFields = useMemo(() => {
    if (!schema) return [] as Array<[string, FormField[]]>;
    const groups = new Map<string, FormField[]>();
    for (const f of schema.fields) {
      const key = f.group ?? 'General';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    return Array.from(groups.entries());
  }, [schema]);

  function setField(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }));
    // If the operator edits a field that was originally prefilled, mark it
    // edited so the audit trail can compare against prefilledSnapshot.
    setEditedPrefilledFields((curr) => {
      if (!prefilledFields.has(name)) return curr;
      if (curr.has(name)) return curr;
      const next = new Set(curr);
      next.add(name);
      return next;
    });
  }

  async function generate() {
    if (!schema || !type) return;
    // Coerce required-field check — number-like fields normalize empty
    // string to null so the backend's schema validator is the source of
    // truth, not the UI.
    const missing = schema.fields
      .filter((f) => f.required)
      .filter((f) => {
        const v = values[f.name];
        return v === undefined || v === null || v === '';
      });
    if (missing.length > 0) {
      toast.error(
        `الحقول المطلوبة: ${missing.map((m) => m.label_ar).slice(0, 3).join('، ')}` +
          (missing.length > 3 ? '…' : '')
      );
      return;
    }
    // Track E gate — if the backend already asked for an override on a prior
    // attempt, require both a non-empty reason and the second-stage confirm
    // box before resubmitting. A hard block (422) cannot be retried at all.
    if (blockReason) {
      toast.error('تعذّر التوليد: شرط جوهري مفقود');
      return;
    }
    if (overrideRequired && (!overrideReason.trim() || !overrideConfirmed)) {
      toast.error('سبب التجاوز مطلوب');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/forms/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          input: {
            ...values,
            // Carry the source IDs through so the backend can stamp
            // them into the PDF metadata for audit trail.
            _source_lead_id: leadId,
            _source_property_id: propertyId,
          },
          override_reason: overrideReason.trim() || null,
          // Track F — auto-fill provenance. Backend logs the diff to
          // audit_log so a regulator can verify which values the
          // operator actually reviewed vs which were auto-filled and
          // signed off unchanged.
          autofill_audit: {
            prefilled_field_names: Array.from(prefilledFields),
            edited_prefilled_field_names: Array.from(editedPrefilledFields),
            prefilled_snapshot: prefilledSnapshot,
          },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as GenerateResponse;

      // Track E hard block — 422 gate_blocked. No override possible.
      if (res.status === 422) {
        setGateWarnings(Array.isArray(j.warnings) ? j.warnings : []);
        setGateNotes(Array.isArray(j.notes) ? j.notes : []);
        setBlockReason(j.block_reason ?? 'gate_blocked');
        setOverrideRequired(false);
        toast.error('تعذّر توليد النموذج: شرط جوهري مفقود');
        return;
      }
      // Track E soft block — 409 override_required. Reveal override UI.
      if (res.status === 409) {
        setGateWarnings(Array.isArray(j.warnings) ? j.warnings : []);
        setGateNotes(Array.isArray(j.notes) ? j.notes : []);
        setOverrideRequired(true);
        setBlockReason(null);
        toast.warning('يحتاج النموذج إلى مبرّر متابعة');
        return;
      }
      if (!res.ok || !j.url) {
        toast.error(
          j.error === 'forms_backend_not_provisioned'
            ? 'خدمة النماذج ليست جاهزة بعد'
            : 'تعذّر توليد النموذج'
        );
        return;
      }
      // Success — surface any informational warnings/notes alongside the PDF.
      setGateWarnings(Array.isArray(j.warnings) ? j.warnings : []);
      setGateNotes(Array.isArray(j.notes) ? j.notes : []);
      setOverrideRequired(false);
      setBlockReason(null);
      setGenerated(j);
      // Open in a new tab + trigger download. We do both because some
      // browsers block programmatic downloads from non-same-origin
      // hosts; opening in a tab lets the operator save it manually.
      window.open(j.url, '_blank', 'noopener,noreferrer');
      const a = document.createElement('a');
      a.href = j.url;
      a.download = `rera-form-${type}-${Date.now()}.pdf`;
      a.click();
      toast.success('تم توليد النموذج');
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  const node = (
    <AnimatePresence>
      {open && type && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80]"
            style={{ background: 'color-mix(in srgb, var(--ink) 45%, transparent)' }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="توليد نموذج RERA"
            initial={{ x: '110%' }}
            animate={{ x: 0 }}
            exit={{ x: '110%' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 bottom-0 left-0 z-[81] w-full sm:w-[40rem] flex flex-col"
            style={{
              background: 'var(--paper)',
              borderRight: '1px solid var(--rule)',
              boxShadow: '0 24px 60px -20px rgba(0,0,0,0.35)',
            }}
          >
            {/* Header */}
            <div
              className="px-6 pt-6 pb-4 shrink-0"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <span
                  className="text-[10px] tracking-widest uppercase inline-flex items-center gap-1.5"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                >
                  <FileText className="w-3 h-3" />
                  RERA · FORM {type}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-ghost h-8 w-8 p-0"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2
                className="display-ar text-xl leading-tight"
                style={{ color: 'var(--ink)' }}
              >
                {schema?.title_ar ?? `Form ${type}`}
              </h2>
              {schema?.title_en && (
                <p
                  className="mt-1 text-[11px]"
                  style={{
                    color: 'var(--ink-faint)',
                    fontFamily: 'var(--font-mono)',
                  }}
                  dir="ltr"
                >
                  {schema.title_en}
                </p>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    style={{ color: 'var(--ink-faint)' }}
                  />
                </div>
              ) : !provisioned || !schema ? (
                <EmptyState />
              ) : (
                <div className="space-y-7">
                  {(leadId || propertyId) && (
                    <div
                      className="p-3 flex items-start gap-2 text-[11px]"
                      style={{
                        background: 'color-mix(in srgb, var(--primary-glow) 8%, var(--paper-lift))',
                        border: '1px solid color-mix(in srgb, var(--primary-glow) 30%, transparent)',
                        borderRadius: '3px',
                        color: 'var(--ink-soft)',
                      }}
                    >
                      <Info
                        className="w-3.5 h-3.5 mt-0.5 shrink-0"
                        style={{ color: 'var(--primary-glow)' }}
                      />
                      <span>
                        تم تعبئة بعض الحقول تلقائياً من{' '}
                        {leadId && propertyId
                          ? 'العميل والعقار'
                          : leadId
                          ? 'بيانات العميل'
                          : 'بيانات العقار'}
                        . راجع وأكمل قبل التوليد.
                      </span>
                    </div>
                  )}

                  {groupedFields.map(([groupName, fields]) => (
                    <section key={groupName}>
                      <div className="section-head !mb-3">
                        <span className="eyebrow">
                          {groupName.toUpperCase()}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {fields.map((f) => (
                          <FormFieldRenderer
                            key={f.name}
                            field={f}
                            value={values[f.name]}
                            onChange={(v) => setField(f.name, v)}
                            isPrefilled={prefilledFields.has(f.name)}
                            isEditedPrefilled={editedPrefilledFields.has(f.name)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {schema && (
              <div
                className="px-6 py-4 shrink-0 flex flex-col gap-3"
                style={{ borderTop: '1px solid var(--rule)' }}
              >
                {/* Track E — RERA integrity gate output banner. Surfaces
                    the backend's warnings (codes) + factual notes whenever
                    the gate flagged anything. A 422 block shows the
                    block_reason in red; a 409 reveals the override UI. */}
                {(gateNotes.length > 0 || gateWarnings.length > 0 || blockReason) && (
                  <div
                    className="p-3 text-[12px]"
                    style={{
                      background: blockReason
                        ? 'color-mix(in srgb, var(--signal) 10%, var(--paper-lift))'
                        : 'color-mix(in srgb, var(--warn, #b6852b) 10%, var(--paper-lift))',
                      border: `1px solid ${blockReason ? 'var(--signal)' : 'var(--warn, #b6852b)'}`,
                      borderRadius: '3px',
                      color: 'var(--ink-soft)',
                    }}
                  >
                    {blockReason && (
                      <p
                        className="font-medium mb-2"
                        style={{ color: 'var(--signal)' }}
                        dir="rtl"
                      >
                        تم رفض التوليد: {blockReason}
                      </p>
                    )}
                    {gateNotes.length > 0 && (
                      <ul className="list-disc pr-4 space-y-1" dir="rtl">
                        {gateNotes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {gateWarnings.length > 0 && (
                      <p
                        className="mt-2 text-[10px] tabular"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--ink-faint)',
                        }}
                        dir="ltr"
                      >
                        {gateWarnings.join(' · ')}
                      </p>
                    )}
                  </div>
                )}

                {/* Track E — override UI shown ONLY after a 409 override_required.
                    Never shown for 422 hard blocks. Generate stays disabled
                    until both the reason is typed AND the confirm box ticks. */}
                {overrideRequired && !blockReason && (
                  <div className="space-y-2">
                    <label
                      className="block text-[12px]"
                      style={{ color: 'var(--ink-soft)' }}
                      dir="rtl"
                    >
                      سبب التجاوز (Override reason)
                    </label>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={2}
                      placeholder="اشرح بإيجاز لماذا تتابع التوليد رغم التحذيرات أعلاه"
                      className="input-boxed w-full text-sm leading-relaxed"
                      dir="rtl"
                    />
                    <label
                      className="flex items-start gap-2 text-[12px] cursor-pointer"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      <input
                        type="checkbox"
                        checked={overrideConfirmed}
                        onChange={(e) => setOverrideConfirmed(e.target.checked)}
                        className="mt-0.5 shrink-0"
                      />
                      <span dir="rtl">
                        أؤكّد المتابعة رغم التحذيرات
                      </span>
                    </label>
                  </div>
                )}

                {/* Track F — review-confirm gate. Generate stays disabled
                    until the operator explicitly ticks the box, even when
                    no fields were auto-filled. PDF generation is a
                    regulator-facing artifact; an explicit "I reviewed" is
                    the audit trail's first line of defense. */}
                <label
                  className="flex items-start gap-2 text-[12px] cursor-pointer"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  <input
                    type="checkbox"
                    checked={reviewedConfirmed}
                    onChange={(e) => setReviewedConfirmed(e.target.checked)}
                    className="mt-0.5 shrink-0"
                  />
                  <span dir="rtl">
                    راجعت كل الحقول وأؤكّد أن البيانات صحيحة. (I have reviewed
                    all fields and confirm they are accurate.)
                  </span>
                </label>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {generated?.url ? (
                    <a
                      href={generated.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] tabular"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--primary-glow)',
                      }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>فتح آخر PDF</span>
                    </a>
                  ) : (
                    <p
                      className="text-[10px] flex-1"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      سيتم فتح PDF في تبويب جديد + تنزيله تلقائياً.
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn-ghost h-10 text-xs px-4"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={generate}
                      disabled={
                        submitting ||
                        !reviewedConfirmed ||
                        blockReason !== null ||
                        (overrideRequired &&
                          (!overrideReason.trim() || !overrideConfirmed))
                      }
                      className="btn-primary h-10 text-xs gap-1.5 px-4 disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Generate PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(node, document.body);
}

function FormFieldRenderer({
  field,
  value,
  onChange,
  isPrefilled = false,
  isEditedPrefilled = false,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  isPrefilled?: boolean;
  isEditedPrefilled?: boolean;
}) {
  const v = value == null ? '' : value;
  const baseLabel = (
    <label className="field-label flex items-center gap-1.5">
      <span>{field.label_ar}</span>
      {field.required && (
        <span style={{ color: 'var(--signal)' }} aria-label="مطلوب">
          *
        </span>
      )}
      {/* Track F — provenance badges. AUTO = seeded from prefill,
          unchanged. EDITED = was auto-filled, operator touched it. */}
      {isPrefilled && !isEditedPrefilled && (
        <span
          className="text-[9px] tracking-widest uppercase px-1.5 py-0.5"
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'color-mix(in srgb, var(--primary-glow) 14%, transparent)',
            color: 'var(--primary-glow)',
            borderRadius: '2px',
          }}
          title="هذا الحقل مُعبَّأ تلقائياً من بيانات العميل / العقار"
        >
          AUTO
        </span>
      )}
      {isEditedPrefilled && (
        <span
          className="text-[9px] tracking-widest uppercase px-1.5 py-0.5"
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'color-mix(in srgb, var(--warn, #b6852b) 14%, transparent)',
            color: 'var(--warn, #b6852b)',
            borderRadius: '2px',
          }}
          title="كان مُعبَّأ تلقائياً ثم عدّلته"
        >
          EDITED
        </span>
      )}
      <span
        className="text-[10px] tracking-widest uppercase ms-auto"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        dir="ltr"
      >
        {field.label_en}
      </span>
    </label>
  );

  const spanFull =
    field.type === 'text' || field.type === 'multiselect' ? 'sm:col-span-2' : '';

  let input: React.ReactNode = null;
  switch (field.type) {
    case 'text':
      input = (
        <textarea
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className="input-boxed w-full text-sm leading-relaxed"
        />
      );
      break;
    case 'number':
    case 'currency':
      input = (
        <input
          type="number"
          value={v as number | string}
          onChange={(e) =>
            onChange(e.target.value === '' ? null : Number(e.target.value))
          }
          placeholder={field.placeholder}
          className="input-boxed h-10 w-full text-sm"
          dir="ltr"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      );
      break;
    case 'date':
      input = (
        <input
          type="date"
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          className="input-boxed h-10 w-full text-sm"
          dir="ltr"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      );
      break;
    case 'phone':
      input = (
        <input
          type="tel"
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? '+971…'}
          className="input-boxed h-10 w-full text-sm"
          dir="ltr"
          style={{ fontFamily: 'var(--font-mono)' }}
          autoComplete="tel"
        />
      );
      break;
    case 'email':
      input = (
        <input
          type="email"
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="input-boxed h-10 w-full text-sm"
          dir="ltr"
          autoComplete="email"
        />
      );
      break;
    case 'select':
      input = (
        <select
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          className="input-boxed h-10 w-full text-sm"
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label_ar ?? o.label_en ?? o.value}
            </option>
          ))}
        </select>
      );
      break;
    case 'multiselect': {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      input = (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => {
            const selected = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  const nv = selected
                    ? arr.filter((x) => x !== o.value)
                    : [...arr, o.value];
                  onChange(nv);
                }}
                className="text-[11px] px-2.5 py-1.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: selected ? 'var(--ink)' : 'transparent',
                  color: selected ? 'var(--paper)' : 'var(--ink-soft)',
                  border: '1px solid var(--rule)',
                  borderRadius: '2px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {o.label_ar ?? o.label_en ?? o.value}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'boolean':
      input = (
        <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <input
            type="checkbox"
            checked={!!v}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4"
            style={{ accentColor: 'var(--primary-glow)' }}
          />
          <span>{field.placeholder ?? 'نعم'}</span>
        </label>
      );
      break;
    case 'string':
    default:
      input = (
        <input
          type="text"
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="input-boxed h-10 w-full text-sm"
        />
      );
      break;
  }

  return (
    <div className={spanFull}>
      {baseLabel}
      {input}
      {field.helper && (
        <p
          className="mt-1 text-[10px] leading-relaxed"
          style={{ color: 'var(--ink-faint)' }}
        >
          {field.helper}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="py-12 px-6 text-center"
      style={{
        background: 'var(--paper-lift)',
        border: '1px dashed var(--rule)',
        borderRadius: '3px',
      }}
    >
      <AlertCircle
        className="w-9 h-9 mx-auto mb-4"
        style={{ color: 'var(--ink-ghost)' }}
        strokeWidth={1}
      />
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        خدمة توليد نماذج RERA غير جاهزة على الخادم بعد.
      </p>
      <p className="text-xs mt-1.5" style={{ color: 'var(--ink-faint)' }}>
        سيتم تنشيط هذه الميزة فور اكتمال ترحيل /internal/rera/forms.
      </p>
    </div>
  );
}
