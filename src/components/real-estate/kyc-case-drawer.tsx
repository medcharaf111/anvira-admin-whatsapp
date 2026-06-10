'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  RefreshCcw,
  Download,
  CheckCircle2,
  FileText,
  Send,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Shield,
} from 'lucide-react';
import type { KycStatus } from '@/components/real-estate/kyc-page';

export interface KycCaseDetail {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  nationality: string | null;
  pep_self_declared: boolean | null;
  source_of_funds: string | null;
  expected_purchase_amount: number | null;
  expected_purchase_currency: string | null;
  /**
   * Latest buyer-stated budget from the linked conversation's
   * leads_qualification.budget_max (+ currency). The bot extracts this
   * structurally from every inbound message; we surface it here so the
   * drawer can render a "suggested update" nudge when it diverges
   * from the operator-owned expected_purchase_amount. Null when the
   * case has no conversation, no joined qualification row, or no
   * budget extraction yet.
   */
  latest_buyer_budget: {
    amount: number | null;
    currency: string | null;
    last_extracted_at: string | null;
  } | null;
  status: KycStatus;
  notes: string | null;
  // Track D CDD fields. All optional on the wire; the backend's
  // kyc_cases_cdd_minimum CHECK blocks status promotion when any are
  // missing (the admin surfaces that as 422 cdd_incomplete).
  date_of_birth: string | null;          // YYYY-MM-DD
  funding_source_type: FundingSourceType | null;
  is_entity: boolean;
  beneficial_owner_name: string | null;
  intended_use: IntendedUse | null;
  documents: KycDocument[];
  screening_log: ScreeningLogEntry[];
  required_doc_types: DocType[];
}

export type FundingSourceType =
  | 'cash'
  | 'mortgage'
  | 'investment_income'
  | 'company_funds'
  | 'inheritance'
  | 'sale_of_property'
  | 'other';

export type IntendedUse =
  | 'residence'
  | 'investment'
  | 'rental'
  | 'commercial'
  | 'other';

const FUNDING_SOURCE_LABELS: Record<FundingSourceType, { ar: string; en: string }> = {
  cash: { ar: 'نقد', en: 'Cash' },
  mortgage: { ar: 'تمويل عقاري', en: 'Mortgage' },
  investment_income: { ar: 'دخل استثماري', en: 'Investment income' },
  company_funds: { ar: 'أموال شركة', en: 'Company funds' },
  inheritance: { ar: 'ميراث', en: 'Inheritance' },
  sale_of_property: { ar: 'بيع عقار', en: 'Sale of property' },
  other: { ar: 'أخرى', en: 'Other' },
};

const INTENDED_USE_LABELS: Record<IntendedUse, { ar: string; en: string }> = {
  residence: { ar: 'سكن خاص', en: 'Residence' },
  investment: { ar: 'استثمار', en: 'Investment' },
  rental: { ar: 'تأجير', en: 'Rental' },
  commercial: { ar: 'تجاري', en: 'Commercial' },
  other: { ar: 'أخرى', en: 'Other' },
};

export interface KycDocument {
  id: string;
  doc_type: DocType;
  filename: string | null;
  preview_url: string | null;
  download_url: string | null;
  uploaded_at: string | null;
}

export interface ScreeningLogEntry {
  id: string;
  ran_at: string;
  // 'not_screened' = no sanctions provider configured (fail-closed,
  // remediation C2). Distinct from 'error' (a retryable upstream failure).
  result: 'clean' | 'match' | 'review_needed' | 'error' | 'not_screened';
  matched_lists: string[] | null;
  notes: string | null;
}

// 2.9 — Canonical DocType vocabulary. Mirrors KycDocType in
// anvira-backend/src/kyc/types.ts AND the kyc_documents.doc_type DB
// CHECK (migration 20260624). Real backend docs come back with
// 'iqama_or_national_id' / 'source_of_funds_letter' / 'aml_attestation'
// / 'other' — the old DOC_LABELS missed all four, so the drawer rendered
// raw enum strings instead of bilingual labels (line ~1283 fallback).
export type DocType =
  | 'passport'
  | 'emirates_id'
  | 'iqama_or_national_id'
  | 'proof_of_address'
  | 'aml_attestation'
  | 'source_of_funds_letter'
  | 'bank_statement'
  | 'salary_certificate'
  | 'other';

const DOC_LABELS: Record<DocType, { ar: string; en: string }> = {
  passport: { ar: 'الجواز', en: 'Passport' },
  emirates_id: { ar: 'الهوية الإماراتية', en: 'Emirates ID' },
  iqama_or_national_id: { ar: 'الإقامة أو الهوية الوطنية', en: 'Iqama / National ID' },
  proof_of_address: { ar: 'إثبات العنوان', en: 'Address proof' },
  aml_attestation: { ar: 'إقرار مكافحة غسل الأموال', en: 'AML attestation' },
  source_of_funds_letter: { ar: 'خطاب مصدر الأموال', en: 'Source-of-funds letter' },
  bank_statement: { ar: 'كشف حساب', en: 'Bank statement' },
  salary_certificate: { ar: 'شهادة راتب', en: 'Salary certificate' },
  other: { ar: 'مستند آخر', en: 'Other' },
};

const STAGE_ORDER: KycStatus[] = [
  'started',
  'docs_pending',
  'docs_collected',
  'screening',
  'ready_for_filing',
  'filed',
];

const STAGE_META: Record<KycStatus, { label: string; pill: string }> = {
  started: { label: 'بدأ', pill: 'pill-idle' },
  docs_pending: { label: 'بانتظار وثائق', pill: 'pill-warn' },
  docs_collected: { label: 'وثائق مكتملة', pill: 'pill-warn' },
  screening: { label: 'فحص العقوبات', pill: 'pill-warn' },
  ready_for_filing: { label: 'جاهز للإيداع', pill: 'pill-signal' },
  filed: { label: 'مودَع', pill: 'pill-success' },
  rejected: { label: 'مرفوض', pill: 'pill-idle' },
  abandoned: { label: 'متروك', pill: 'pill-idle' },
};

const SCREENING_PILL: Record<ScreeningLogEntry['result'], string> = {
  clean: 'pill-success',
  match: 'pill-signal',
  review_needed: 'pill-warn',
  error: 'pill-idle',
  not_screened: 'pill-warn',
};

function fmtAed(amount: number | null, currency: string | null): string {
  if (amount === null) return '—';
  const fmt = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });
  return `${currency ?? 'AED'} ${fmt.format(amount)}`;
}

export function KycCaseDrawer({
  open,
  caseId,
  detail,
  loading,
  onClose,
  onUpdated,
}: {
  open: boolean;
  caseId: string | null;
  detail: KycCaseDetail | null;
  loading: boolean;
  onClose: () => void;
  onUpdated: (d: KycCaseDetail) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (detail) setNotes(detail.notes ?? '');
  }, [detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Debounced notes auto-save — operator types, we wait 800ms idle
  // before sending the PATCH. Avoids hammering the backend on every
  // keystroke without forcing them to click a save button.
  function onNotesChange(v: string) {
    setNotes(v);
    if (!detail) return;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      void patchCase({ notes: v }, /* silent */ true);
    }, 800);
  }

  async function patchCase(
    body: Partial<
      Pick<
        KycCaseDetail,
        | 'status'
        | 'notes'
        | 'date_of_birth'
        | 'funding_source_type'
        | 'is_entity'
        | 'beneficial_owner_name'
        | 'intended_use'
        | 'expected_purchase_amount'
        | 'expected_purchase_currency'
      >
    >,
    silent = false
  ) {
    if (!detail) return;
    try {
      const res = await fetch(`/api/kyc/cases/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as Partial<KycCaseDetail>;
      onUpdated({ ...detail, ...j, ...body } as KycCaseDetail);
      if (!silent) toast.success('تم الحفظ');
    } catch {
      if (!silent) toast.error('تعذّر الحفظ');
    }
  }

  async function rescreen() {
    if (!detail) return;
    setBusy('screen');
    try {
      const res = await fetch(`/api/kyc/cases/${detail.id}/screen`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { case?: KycCaseDetail };
      toast.success('تم تشغيل الفحص');
      if (j.case) onUpdated(j.case);
    } catch {
      toast.error('تعذّر الفحص');
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    if (!detail) return;
    setBusy('pdf');
    try {
      const res = await fetch(`/api/kyc/cases/${detail.id}/report-pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kyc-${detail.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('تعذّر تحميل التقرير');
    } finally {
      setBusy(null);
    }
  }

  async function downloadGoamlXml() {
    if (!detail) return;
    setBusy('goaml');
    try {
      const res = await fetch(`/api/kyc/cases/${detail.id}/goaml-xml`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `goaml-${detail.id}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('تعذّر تحميل ملف goAML XML');
    } finally {
      setBusy(null);
    }
  }

  async function requestDoc(docType: DocType) {
    if (!detail) return;
    setBusy(`doc:${docType}`);
    try {
      const res = await fetch(`/api/kyc/cases/${detail.id}/request-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إرسال طلب الوثيقة');
    } catch {
      toast.error('تعذّر الإرسال');
    } finally {
      setBusy(null);
    }
  }

  if (!mounted || !caseId) return null;

  const stageIdx = detail ? STAGE_ORDER.indexOf(detail.status) : -1;
  const submittedDocs = new Set((detail?.documents ?? []).map((d) => d.doc_type));
  // 2.9 — Mirror backend buildChecklist() base list (src/kyc/types.ts).
  // Backend returns required_doc_types via /api/kyc/cases/[id]; this is the
  // pre-load fallback before that round-trip lands. Old 'source_of_funds'
  // was DB-invalid; aml_attestation + bank_statement were missing from the
  // base required set.
  const requiredDocs = detail?.required_doc_types ?? [
    'passport',
    'emirates_id',
    'bank_statement',
    'proof_of_address',
    'aml_attestation',
  ];

  const node = (
    <AnimatePresence>
      {open && (
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
            aria-label="تفاصيل حالة KYC"
            initial={{ x: '110%' }}
            animate={{ x: 0 }}
            exit={{ x: '110%' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 bottom-0 left-0 z-[81] w-full sm:w-[36rem] flex flex-col"
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
                  <Shield className="w-3 h-3" />
                  KYC · {caseId.slice(0, 8)}
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

              {loading || !detail ? (
                <div className="h-24 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--ink-faint)' }} />
                </div>
              ) : (
                <>
                  <h2 className="display-ar text-2xl" style={{ color: 'var(--ink)' }}>
                    {detail.customer_name || 'بدون اسم'}
                  </h2>
                  <div
                    className="mt-1.5 text-[11px] tabular"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                    dir="ltr"
                  >
                    {detail.customer_phone}
                  </div>
                  <div className="mt-4 flex items-center gap-3 flex-wrap">
                    <span className={`pill ${STAGE_META[detail.status].pill}`}>
                      <span className="pill-dot" />
                      <span>{STAGE_META[detail.status].label}</span>
                    </span>
                  </div>
                  <StageTrack currentIdx={stageIdx} />
                </>
              )}
            </div>

            {detail && (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
                {/* Section 1: Customer profile */}
                <section>
                  <SectionHead label="CUSTOMER PROFILE" />
                  <div
                    className="divide-y"
                    style={{
                      borderColor: 'var(--rule)',
                      background: 'var(--paper-lift)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                    }}
                  >
                    <Row label="Nationality" ar="الجنسية" value={detail.nationality ?? '—'} />
                    <Row
                      label="PEP self-declaration"
                      ar="إفصاح PEP"
                      value={
                        detail.pep_self_declared === null
                          ? '—'
                          : detail.pep_self_declared
                          ? 'نعم'
                          : 'لا'
                      }
                      accent={detail.pep_self_declared ? 'signal' : undefined}
                    />
                    <Row
                      label="Source of funds"
                      ar="مصدر الأموال"
                      value={detail.source_of_funds ?? '—'}
                    />
                    <ExpectedAmountRow detail={detail} patchCase={patchCase} />
                  </div>
                </section>

                {/* Track D — CDD editor. Inline-editable so operator can
                    populate the fields the kyc_cases_cdd_minimum CHECK
                    requires before promoting status past docs_pending.
                    Each input saves on blur via patchCase (silent). */}
                <CddEditor detail={detail} patchCase={patchCase} />

                {/* Section 2: Documents */}
                <section>
                  <SectionHead label="DOCUMENTS COLLECTED" />
                  <div className="grid grid-cols-2 gap-2">
                    {requiredDocs.map((dt) => {
                      const doc = detail.documents.find((d) => d.doc_type === dt);
                      if (doc) {
                        return <DocumentCard key={dt} doc={doc} />;
                      }
                      return (
                        <MissingDocCard
                          key={dt}
                          docType={dt}
                          busy={busy === `doc:${dt}`}
                          onRequest={() => requestDoc(dt)}
                        />
                      );
                    })}
                    {/* Extra docs the customer uploaded that aren't in the
                        required list — show them as additional cards. */}
                    {detail.documents
                      .filter((d) => !requiredDocs.includes(d.doc_type))
                      .map((doc) => (
                        <DocumentCard key={doc.id} doc={doc} />
                      ))}
                  </div>
                  <p
                    className="mt-2 text-[11px]"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    {submittedDocs.size} / {requiredDocs.length} وثائق مطلوبة
                  </p>
                </section>

                {/* Section 3: Screening log */}
                <section>
                  <SectionHead label="SANCTIONS SCREENING" />
                  {detail.screening_log.length === 0 ? (
                    <div
                      className="px-4 py-5 text-xs text-center"
                      style={{
                        background: 'var(--paper-lift)',
                        border: '1px dashed var(--rule)',
                        borderRadius: '3px',
                        color: 'var(--ink-faint)',
                      }}
                    >
                      لم يتم تشغيل أي فحص بعد.
                    </div>
                  ) : (
                    <ul
                      className="divide-y"
                      style={{
                        borderColor: 'var(--rule)',
                        background: 'var(--paper-lift)',
                        border: '1px solid var(--rule)',
                        borderRadius: '3px',
                      }}
                    >
                      {detail.screening_log.map((entry) => (
                        <ScreeningRow key={entry.id} entry={entry} />
                      ))}
                    </ul>
                  )}
                </section>

                {/* Section 4: Actions */}
                <section>
                  <SectionHead label="ACTIONS" />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={rescreen}
                      disabled={busy === 'screen'}
                      className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3"
                    >
                      {busy === 'screen' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCcw className="w-3.5 h-3.5" />
                      )}
                      <span>إعادة الفحص</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => patchCase({ status: 'ready_for_filing' })}
                      disabled={detail.status === 'ready_for_filing' || detail.status === 'filed'}
                      className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>جاهز للإيداع</span>
                    </button>
                  </div>

                  {/* Filing artefacts — PDF (human-readable narrative)
                      and goAML XML (machine-readable for FIU portal
                      upload). Both gated to ready_for_filing / filed:
                      earlier stages can't legitimately generate a
                      filing artifact yet. */}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(() => {
                      const filingReady =
                        detail.status === 'ready_for_filing' || detail.status === 'filed';
                      const tooltipMsg = filingReady
                        ? undefined
                        : 'Available only when status = ready_for_filing or filed';
                      return (
                        <>
                          <button
                            type="button"
                            onClick={downloadPdf}
                            disabled={busy === 'pdf' || !filingReady}
                            title={tooltipMsg}
                            aria-disabled={!filingReady}
                            className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3"
                          >
                            {busy === 'pdf' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            <span>Download PDF report</span>
                          </button>
                          <button
                            type="button"
                            onClick={downloadGoamlXml}
                            disabled={busy === 'goaml' || !filingReady}
                            title={tooltipMsg}
                            aria-disabled={!filingReady}
                            className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3"
                          >
                            {busy === 'goaml' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                            <span>Download goAML XML</span>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  {/* goAML draft disclaimer (per addendum). The exported
                      XML is a draft the broker reviews + manually
                      submits — Anvira never submits to FIU directly. */}
                  <p
                    className="mt-2 text-[10px] leading-relaxed"
                    style={{ color: 'var(--ink-faint)' }}
                    dir="rtl"
                  >
                    هذا الملف <strong>مسوّدة للمراجعة</strong> تُرفع يدوياً إلى بوابة
                    goAML الخاصة بوحدة المعلومات المالية الإماراتية. Anvira لا
                    تُقدّم التقارير إلى الجهات التنظيمية. المكتب مسؤول عن
                    مراجعة الملف وتصحيحه وإيداعه ضمن المهل التنظيمية. التوقيع
                    الرقمي يتمّ داخل بوابة goAML بعد التحميل.
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => patchCase({ status: 'filed' })}
                      disabled={detail.status === 'filed'}
                      className="btn-primary h-10 text-xs gap-1.5 justify-start px-3 col-span-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>وضع علامة "مودَع"</span>
                    </button>
                  </div>
                </section>

                {/* Section 5: Notes */}
                <section>
                  <SectionHead label="OPERATOR NOTES" />
                  <textarea
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    rows={5}
                    placeholder="ملاحظات داخلية حول الحالة — تُحفظ تلقائياً"
                    className="input-boxed w-full text-sm leading-relaxed"
                    style={{ fontFamily: 'var(--font-body)' }}
                  />
                  <p className="mt-1.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                    يُحفظ تلقائياً عند التوقّف عن الكتابة.
                  </p>
                </section>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(node, document.body);
}

function StageTrack({ currentIdx }: { currentIdx: number }) {
  return (
    <div className="mt-5">
      <div
        className="flex items-center gap-1.5 mb-2 text-[9px] tracking-widest uppercase"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
      >
        <span>STARTED</span>
        <span className="flex-1 h-px" style={{ background: 'var(--rule)' }} />
        <span>DOCS</span>
        <span className="flex-1 h-px" style={{ background: 'var(--rule)' }} />
        <span>SCREENED</span>
        <span className="flex-1 h-px" style={{ background: 'var(--rule)' }} />
        <span>READY</span>
        <span className="flex-1 h-px" style={{ background: 'var(--rule)' }} />
        <span>FILED</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden"
        style={{ background: 'var(--paper-sink)', borderRadius: '1px' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{
            width:
              currentIdx < 0
                ? '0%'
                : `${Math.min(100, ((currentIdx + 1) / STAGE_ORDER.length) * 100)}%`,
          }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
          style={{
            background:
              'linear-gradient(90deg, var(--warn), var(--primary-glow))',
            borderRadius: '1px',
          }}
        />
      </div>
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="section-head !mb-3">
      <span className="eyebrow">{label}</span>
    </div>
  );
}

/**
 * Inline-editable Expected amount row. The KYC case's
 * expected_purchase_amount is the declared transaction value for the
 * filing — distinct from the lead's drifting "current budget intent"
 * on leads_qualification. Operator owns updates here so the
 * audit_log row that ships with the AML/CFT filing carries an
 * explicit, attributable change. Edits save on Save click (not on
 * blur) because the operator typing typically reaches digits before
 * settling on the right value, and we don't want to spam the audit
 * log with every keystroke.
 */
function ExpectedAmountRow({
  detail,
  patchCase,
}: {
  detail: KycCaseDetail;
  patchCase: (body: CddPatchFields, silent?: boolean) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<string>(
    detail.expected_purchase_amount != null
      ? String(detail.expected_purchase_amount)
      : ''
  );
  const [currency, setCurrency] = useState<string>(
    detail.expected_purchase_currency ?? 'AED'
  );
  const [saving, setSaving] = useState(false);

  // Re-sync when the upstream detail changes (e.g. realtime refresh).
  useEffect(() => {
    if (editing) return;
    setAmount(
      detail.expected_purchase_amount != null
        ? String(detail.expected_purchase_amount)
        : ''
    );
    setCurrency(detail.expected_purchase_currency ?? 'AED');
  }, [
    detail.expected_purchase_amount,
    detail.expected_purchase_currency,
    editing,
  ]);

  async function save() {
    const parsed = amount.trim() === '' ? null : Number(amount.replace(/[,\s]/g, ''));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('قيمة غير صحيحة');
      return;
    }
    const cleanCurrency = currency.trim().toUpperCase() || 'AED';
    const unchanged =
      parsed === (detail.expected_purchase_amount ?? null) &&
      cleanCurrency === (detail.expected_purchase_currency ?? 'AED');
    if (unchanged) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await patchCase({
      expected_purchase_amount: parsed,
      expected_purchase_currency: cleanCurrency,
    });
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setAmount(
      detail.expected_purchase_amount != null
        ? String(detail.expected_purchase_amount)
        : ''
    );
    setCurrency(detail.expected_purchase_currency ?? 'AED');
    setEditing(false);
  }

  // Compute whether the buyer's latest WhatsApp-stated budget diverges
  // from the operator-set expected_purchase_amount. We don't auto-sync —
  // operator review is required for regulator-facing accuracy — but
  // surface a one-click "apply" nudge so the operator doesn't have to
  // open the conversation just to copy the number across.
  const lbb = detail.latest_buyer_budget;
  const lbbAmount = lbb?.amount ?? null;
  const lbbCurrency = (lbb?.currency ?? '').toUpperCase() || null;
  const curAmount = detail.expected_purchase_amount ?? null;
  const curCurrency = (detail.expected_purchase_currency ?? 'AED').toUpperCase();
  const hasSuggestion =
    !editing &&
    lbbAmount !== null &&
    lbbCurrency !== null &&
    (lbbAmount !== curAmount || lbbCurrency !== curCurrency);

  async function applySuggestion() {
    if (!hasSuggestion || lbbAmount === null || lbbCurrency === null) return;
    setSaving(true);
    await patchCase({
      expected_purchase_amount: lbbAmount,
      expected_purchase_currency: lbbCurrency,
    });
    setSaving(false);
  }

  return (
    <div className="p-3 flex items-start gap-3">
      <div className="w-28 shrink-0">
        <div
          className="text-[10px] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          Expected amount
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
          المبلغ المتوقّع
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={saving}
              className="h-9 px-2 text-sm outline-none"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                minWidth: 70,
              }}
            >
              <option value="AED">AED</option>
              <option value="USD">USD</option>
              <option value="SAR">SAR</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
              placeholder="1500000"
              dir="ltr"
              className="flex-1 min-w-[100px] h-9 px-2 text-sm tabular text-left outline-none"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-9 px-3 text-[12px] disabled:opacity-50"
              style={{
                background: 'var(--ink)',
                color: 'var(--paper)',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {saving ? '...' : 'SAVE'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="h-9 px-3 text-[12px] disabled:opacity-50"
              style={{
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-soft)',
              }}
            >
              CANCEL
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-left w-full hover:opacity-80 transition-opacity"
              style={{
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
              title="انقر للتعديل"
            >
              {fmtAed(
                detail.expected_purchase_amount,
                detail.expected_purchase_currency
              )}
              <span
                className="text-[10px] mr-2"
                style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}
              >
                ✎
              </span>
            </button>
            {hasSuggestion && (
              <div
                className="text-[11px] px-2.5 py-1.5 flex items-center gap-2 flex-wrap"
                style={{
                  background:
                    'color-mix(in srgb, var(--primary-glow) 10%, var(--paper-sink))',
                  border:
                    '1px solid color-mix(in srgb, var(--primary-glow) 35%, var(--rule))',
                  borderRadius: '3px',
                  color: 'var(--ink-soft)',
                }}
                dir="rtl"
              >
                <span>
                  العميل ذكر{' '}
                  <strong
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink)',
                    }}
                  >
                    {fmtAed(lbbAmount, lbbCurrency)}
                  </strong>{' '}
                  في المحادثة. تطبيق؟
                </span>
                <button
                  type="button"
                  onClick={applySuggestion}
                  disabled={saving}
                  className="h-7 px-2.5 text-[11px] disabled:opacity-50 ms-auto"
                  style={{
                    background: 'var(--primary-glow)',
                    color: 'var(--paper)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {saving ? '...' : 'APPLY'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  ar,
  value,
  mono,
  accent,
}: {
  label: string;
  ar: string;
  value: string;
  mono?: boolean;
  accent?: 'signal';
}) {
  return (
    <div className="p-3 flex items-start gap-3">
      <div className="w-28 shrink-0">
        <div
          className="text-[10px] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          {label}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
          {ar}
        </div>
      </div>
      <div
        className="flex-1 min-w-0 text-sm"
        style={{
          color: accent === 'signal' ? 'var(--signal)' : 'var(--ink)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * CDD Editor — Track D admin polish
 * ─────────────────────────────────────────────────────────────────────
 * Renders editable inputs for the 5 CDD fields the kyc_cases_cdd_minimum
 * CHECK enforces before a case can move past docs_pending:
 *   - date_of_birth (HTML date input)
 *   - funding_source_type (select)
 *   - intended_use (select)
 *   - is_entity (checkbox; gates beneficial_owner_name visibility)
 *   - beneficial_owner_name (text, required when is_entity)
 *
 * Each field saves on blur via patchCase (silent, no toast). The
 * "Missing CDD fields" warning at the top lists what's still required
 * so the operator knows what's blocking status promotion.
 */
type CddPatchFields = Partial<
  Pick<
    KycCaseDetail,
    | 'date_of_birth'
    | 'funding_source_type'
    | 'is_entity'
    | 'beneficial_owner_name'
    | 'intended_use'
    | 'expected_purchase_amount'
    | 'expected_purchase_currency'
  >
>;

function CddEditor({
  detail,
  patchCase,
}: {
  detail: KycCaseDetail;
  patchCase: (body: CddPatchFields, silent?: boolean) => Promise<void>;
}) {
  const [dob, setDob] = useState(detail.date_of_birth ?? '');
  const [funding, setFunding] = useState<FundingSourceType | ''>(
    detail.funding_source_type ?? ''
  );
  const [use, setUse] = useState<IntendedUse | ''>(detail.intended_use ?? '');
  const [isEntity, setIsEntity] = useState(detail.is_entity);
  const [bo, setBo] = useState(detail.beneficial_owner_name ?? '');

  // Compute what's still missing so the operator sees a single line of
  // "needs: X, Y, Z" rather than discovering it via a failed status
  // promotion. Mirrors the backend CHECK exactly.
  const missing: string[] = [];
  if (!dob) missing.push('تاريخ الميلاد');
  if (!funding) missing.push('مصدر التمويل');
  if (!use) missing.push('الغرض');
  if (isEntity && !bo.trim()) missing.push('المالك المستفيد');

  return (
    <section>
      <SectionHead label="CUSTOMER DUE DILIGENCE · CDD" />
      <div
        className="space-y-3 p-4"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        {missing.length > 0 && (
          <div
            className="text-xs px-3 py-2"
            style={{
              background: 'color-mix(in srgb, var(--warn, #b6852b) 12%, var(--paper))',
              border: '1px solid color-mix(in srgb, var(--warn, #b6852b) 40%, var(--rule))',
              borderRadius: '3px',
              color: 'var(--ink-soft)',
            }}
            dir="rtl"
          >
            <strong>مطلوب لإكمال CDD:</strong> {missing.join('، ')}.{' '}
            <span style={{ color: 'var(--ink-faint)' }}>
              ترقية الحالة محظورة حتى تكتمل هذه الحقول.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Date of birth */}
          <FieldLabel ar="تاريخ الميلاد" en="Date of birth">
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              onBlur={() => {
                if ((dob || null) !== detail.date_of_birth) {
                  void patchCase({ date_of_birth: dob || null }, true);
                }
              }}
              className="w-full h-9 px-2 text-sm tabular outline-none"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </FieldLabel>

          {/* Funding source */}
          <FieldLabel ar="مصدر التمويل" en="Funding source">
            <select
              value={funding}
              onChange={(e) => {
                const v = (e.target.value as FundingSourceType) || '';
                setFunding(v);
                void patchCase({ funding_source_type: v || null }, true);
              }}
              className="w-full h-9 px-2 text-sm outline-none"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
              }}
              dir="rtl"
            >
              <option value="">—</option>
              {(Object.keys(FUNDING_SOURCE_LABELS) as FundingSourceType[]).map((k) => (
                <option key={k} value={k}>
                  {FUNDING_SOURCE_LABELS[k].ar} · {FUNDING_SOURCE_LABELS[k].en}
                </option>
              ))}
            </select>
          </FieldLabel>

          {/* Intended use */}
          <FieldLabel ar="الغرض من الشراء" en="Intended use">
            <select
              value={use}
              onChange={(e) => {
                const v = (e.target.value as IntendedUse) || '';
                setUse(v);
                void patchCase({ intended_use: v || null }, true);
              }}
              className="w-full h-9 px-2 text-sm outline-none"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
              }}
              dir="rtl"
            >
              <option value="">—</option>
              {(Object.keys(INTENDED_USE_LABELS) as IntendedUse[]).map((k) => (
                <option key={k} value={k}>
                  {INTENDED_USE_LABELS[k].ar} · {INTENDED_USE_LABELS[k].en}
                </option>
              ))}
            </select>
          </FieldLabel>

          {/* is_entity toggle */}
          <FieldLabel ar="المشتري كيان اعتباري؟" en="Is entity?">
            <label
              className="inline-flex items-center gap-2 h-9 px-2 text-sm cursor-pointer"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                color: 'var(--ink)',
              }}
            >
              <input
                type="checkbox"
                checked={isEntity}
                onChange={(e) => {
                  const v = e.target.checked;
                  setIsEntity(v);
                  // Clear BO when switching back to natural person.
                  void patchCase(
                    v
                      ? { is_entity: true }
                      : { is_entity: false, beneficial_owner_name: null },
                    true
                  );
                  if (!v) setBo('');
                }}
              />
              <span dir="rtl">شركة أو منشأة</span>
            </label>
          </FieldLabel>

          {/* Beneficial owner — only when is_entity */}
          {isEntity && (
            <FieldLabel ar="المالك المستفيد" en="Beneficial owner" className="sm:col-span-2">
              <input
                type="text"
                value={bo}
                onChange={(e) => setBo(e.target.value)}
                onBlur={() => {
                  if ((bo.trim() || null) !== detail.beneficial_owner_name) {
                    void patchCase(
                      { beneficial_owner_name: bo.trim() || null },
                      true
                    );
                  }
                }}
                placeholder="الاسم الكامل للمالك المستفيد الفعلي"
                className="w-full h-9 px-2 text-sm outline-none"
                style={{
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                  color: 'var(--ink)',
                }}
                dir="rtl"
              />
            </FieldLabel>
          )}
        </div>
      </div>
    </section>
  );
}

function FieldLabel({
  ar,
  en,
  children,
  className,
}: {
  ar: string;
  en: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className="flex items-baseline justify-between mb-1"
        style={{ color: 'var(--ink-faint)' }}
      >
        <span className="text-xs" dir="rtl">
          {ar}
        </span>
        <span
          className="text-[10px] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {en}
        </span>
      </div>
      {children}
    </div>
  );
}

function DocumentCard({ doc }: { doc: KycDocument }) {
  return (
    <a
      href={doc.download_url ?? doc.preview_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 transition-colors"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div
        className="aspect-[4/3] mb-2 flex items-center justify-center overflow-hidden"
        style={{
          background: 'var(--paper-sink)',
          borderRadius: '2px',
        }}
      >
        {doc.preview_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.preview_url}
            alt={doc.filename ?? doc.doc_type}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <FileText className="w-6 h-6" style={{ color: 'var(--ink-faint)' }} strokeWidth={1.25} />
        )}
      </div>
      <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>
        {DOC_LABELS[doc.doc_type]?.ar ?? doc.doc_type}
      </div>
      <div
        className="text-[10px] truncate mt-0.5"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        dir="ltr"
      >
        {doc.filename ?? doc.doc_type}
      </div>
    </a>
  );
}

function MissingDocCard({
  docType,
  busy,
  onRequest,
}: {
  docType: DocType;
  busy: boolean;
  onRequest: () => void;
}) {
  return (
    <div
      className="p-3"
      style={{
        background: 'var(--paper-lift)',
        border: '1px dashed var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div
        className="aspect-[4/3] mb-2 flex items-center justify-center"
        style={{ background: 'var(--paper-sink)', borderRadius: '2px' }}
      >
        <FileText
          className="w-6 h-6"
          style={{ color: 'var(--ink-ghost)' }}
          strokeWidth={1}
        />
      </div>
      <div className="text-xs font-medium truncate" style={{ color: 'var(--ink-soft)' }}>
        {DOC_LABELS[docType]?.ar ?? docType}
      </div>
      <button
        type="button"
        onClick={onRequest}
        disabled={busy}
        className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-7 text-[10px] tracking-widest uppercase"
        style={{
          fontFamily: 'var(--font-mono)',
          background: 'transparent',
          color: 'var(--primary-glow)',
          border: '1px solid color-mix(in srgb, var(--primary-glow) 40%, transparent)',
          borderRadius: '2px',
        }}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        <span>طلب عبر WhatsApp</span>
      </button>
    </div>
  );
}

function ScreeningRow({ entry }: { entry: ScreeningLogEntry }) {
  const Icon =
    entry.result === 'clean'
      ? ShieldCheck
      : entry.result === 'match'
      ? ShieldAlert
      : Shield;
  return (
    <li className="p-3 flex items-start gap-3">
      <Icon
        className="w-4 h-4 mt-0.5 shrink-0"
        style={{
          color:
            entry.result === 'clean'
              ? 'var(--primary-glow)'
              : entry.result === 'match'
              ? 'var(--signal)'
              : 'var(--warn)',
        }}
        strokeWidth={1.5}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`pill ${SCREENING_PILL[entry.result]}`}>
            <span className="pill-dot" />
            <span>
              {entry.result === 'clean'
                ? 'نظيف'
                : entry.result === 'match'
                ? 'تطابق'
                : entry.result === 'review_needed'
                ? 'يحتاج مراجعة'
                : entry.result === 'not_screened'
                ? 'لم يُفحَص — لا مزوّد'
                : 'خطأ'}
            </span>
          </span>
          <span
            className="text-[10px] tabular"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            dir="ltr"
          >
            {new Date(entry.ran_at).toLocaleString('en-GB')}
          </span>
        </div>
        {entry.matched_lists && entry.matched_lists.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {entry.matched_lists.map((l) => (
              <span
                key={l}
                className="text-[10px] px-1.5 py-0.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--paper-sink)',
                  border: '1px solid var(--rule)',
                  borderRadius: '2px',
                  color: 'var(--ink-soft)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {l}
              </span>
            ))}
          </div>
        )}
        {entry.notes && (
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {entry.notes}
          </p>
        )}
      </div>
    </li>
  );
}
