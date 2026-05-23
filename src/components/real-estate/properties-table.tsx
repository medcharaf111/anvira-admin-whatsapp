'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Loader2,
  Image as ImageIcon,
  Upload,
  Building2,
  FileText,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface ProjectLite {
  id: string;
  name: string;
}

export interface PaymentPlanLite {
  id: string;
  name: string;
}

export interface PropertyRow {
  id: string;
  reference: string | null;
  type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  price: number | null;
  currency: string;
  location: string | null;
  view: string | null;
  handover_date: string | null;
  status: 'available' | 'reserved' | 'sold' | 'off_market';
  is_offplan: boolean;
  // Track B/E additions — surfaced for read here so list-view filters
  // can use sale_status; full edit UI is in the off-plan drawer section.
  sale_status: 'ready' | 'off_plan' | 'under_construction' | null;
  construction_milestones: Array<{
    name: string;
    target_date?: string;
    completed?: boolean;
  }> | null;
  escrow_account_ref: string | null;
  developer_name: string | null;
  dld_oqood_ref: string | null;
  wafi_ref: string | null;
  designated_foreign_zone: boolean;
  highlights: string[] | null;
  media_urls: string[] | null;
  project_id: string | null;
  payment_plan_id: string | null;
  projects: { name: string } | null;
  payment_plans: { name: string } | null;
}

const STATUS_LABEL: Record<PropertyRow['status'], string> = {
  available: 'متاح',
  reserved: 'محجوز',
  sold: 'مباع',
  off_market: 'خارج السوق',
};

const STATUS_VARIANT: Record<PropertyRow['status'], 'success' | 'warn' | 'idle' | 'signal'> = {
  available: 'success',
  reserved: 'warn',
  sold: 'idle',
  off_market: 'signal',
};

const PROPERTY_TYPES = [
  'apartment',
  'villa',
  'townhouse',
  'penthouse',
  'plot',
  'commercial',
  'office',
  'retail',
] as const;

const TYPE_LABEL: Record<string, string> = {
  apartment: 'شقة',
  villa: 'فيلا',
  townhouse: 'تاون هاوس',
  penthouse: 'بنتهاوس',
  plot: 'أرض',
  commercial: 'تجاري',
  office: 'مكتب',
  retail: 'محل تجاري',
};

/**
 * Coerce whatever Supabase hands us into string[]. Real Postgres text[]
 * arrives as JS array, but `properties.highlights` is a plain TEXT column
 * — historic rows may be a single string, a Postgres array literal
 * (`'{a,b,c}'`), or a JSON-encoded array. We accept all three and any
 * other shape maps to []. Keeps .join / .filter / .map from blowing up.
 */
function toStringArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return [];
    // JSON array literal — `["a","b"]`
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((x): x is string => typeof x === 'string');
        }
      } catch {
        /* fall through */
      }
    }
    // Postgres array literal — `{a,b,c}` — strip braces and split on comma.
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^"(.*)"$/, '$1'))
        .filter(Boolean);
    }
    // Plain string with newlines (how the textarea persists highlights).
    if (trimmed.includes('\n')) {
      return trimmed.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    // Single line — treat as one-element array.
    return [trimmed];
  }
  return [];
}

export function PropertiesTable({
  properties,
  projects,
  plans,
}: {
  properties: PropertyRow[];
  projects: ProjectLite[];
  plans: PaymentPlanLite[];
}) {
  const [statusFilter, setStatusFilter] = useState<PropertyRow['status'] | 'all'>('all');
  const [offplanOnly, setOffplanOnly] = useState(false);
  const [bedroomFilter, setBedroomFilter] = useState<string>('all');
  const [editing, setEditing] = useState<PropertyRow | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (offplanOnly && !p.is_offplan) return false;
      if (bedroomFilter !== 'all') {
        const n = Number(bedroomFilter);
        if (Number.isFinite(n) && p.bedrooms !== n) return false;
      }
      return true;
    });
  }, [properties, statusFilter, offplanOnly, bedroomFilter]);

  return (
    <>
      {/* Filter strip */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        {(['all', 'available', 'reserved', 'sold', 'off_market'] as const).map((s) => {
          const active = statusFilter === s;
          const label = s === 'all' ? 'الكل' : STATUS_LABEL[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className="h-9 px-3 text-xs"
              style={{
                background: active ? 'var(--ink)' : 'var(--paper-lift)',
                color: active ? 'var(--paper)' : 'var(--ink-soft)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {label}
            </button>
          );
        })}

        <label
          className="flex items-center gap-2 text-xs cursor-pointer mx-2"
          style={{ color: 'var(--ink-soft)' }}
        >
          <input
            type="checkbox"
            checked={offplanOnly}
            onChange={(e) => setOffplanOnly(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          <span>Off-plan فقط</span>
        </label>

        <select
          value={bedroomFilter}
          onChange={(e) => setBedroomFilter(e.target.value)}
          className="input-boxed h-9 text-xs"
          style={{ minWidth: '8rem' }}
        >
          <option value="all">كل الغرف</option>
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'استوديو' : `${n} غرف`}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn-primary h-9 px-4 text-sm gap-2 ml-auto"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span>إضافة عقار</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center panel" style={{ borderStyle: 'dashed' }}>
          <Building2
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            لا توجد عقارات تطابق الفلاتر.
          </p>
        </div>
      ) : (
        <div>
          {/* Header row */}
          <div
            className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 py-3 px-4 text-[10px]"
            style={{
              borderBottom: '1px solid var(--rule)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            <span>المرجع · النوع · المشروع</span>
            <span>الغرف</span>
            <span>المساحة</span>
            <span>السعر</span>
            <span>الحالة</span>
            <span></span>
          </div>

          {filtered.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center py-4 px-4 row-hover"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="min-w-0">
                <div
                  className="text-sm font-medium truncate flex items-center gap-2"
                  style={{ color: 'var(--ink)' }}
                >
                  <span>{p.reference ?? '—'}</span>
                  {p.is_offplan && (
                    <span
                      className="text-[9px] px-1.5 py-0.5"
                      style={{
                        background: 'var(--paper-sink)',
                        border: '1px solid var(--rule)',
                        borderRadius: '2px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-faint)',
                      }}
                    >
                      OFF-PLAN
                    </span>
                  )}
                </div>
                <div
                  className="text-[11px] mt-0.5 truncate"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  {TYPE_LABEL[p.type] ?? p.type}
                  {p.projects?.name ? ` · ${p.projects.name}` : ''}
                  {p.location ? ` · ${p.location}` : ''}
                </div>
              </div>

              <div className="text-xs tabular text-center min-w-[3rem]" style={{ color: 'var(--ink-soft)' }}>
                {p.bedrooms ?? '—'}
              </div>
              <div className="text-xs tabular text-center min-w-[4rem]" style={{ color: 'var(--ink-soft)' }}>
                {p.area_sqft ? `${p.area_sqft.toLocaleString()} ft²` : '—'}
              </div>
              <div
                className="text-sm tabular text-right min-w-[6rem]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
              >
                {p.price ? `${p.currency} ${p.price.toLocaleString()}` : '—'}
              </div>

              <div className="shrink-0">
                <span className={`pill pill-${STATUS_VARIANT[p.status]}`}>
                  <span className="pill-dot" />
                  <span>{STATUS_LABEL[p.status]}</span>
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing(p)}
                  className="btn-ghost h-8 w-8 p-0"
                  aria-label="تعديل"
                >
                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {(editing || creating) && (
          <PropertyModal
            property={editing}
            projects={projects}
            plans={plans}
            onClose={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PropertyModal({
  property,
  projects,
  plans,
  onClose,
}: {
  property: PropertyRow | null;
  projects: ProjectLite[];
  plans: PaymentPlanLite[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = !!property;
  const [reference, setReference] = useState(property?.reference ?? '');
  const [type, setType] = useState(property?.type ?? 'apartment');
  const [bedrooms, setBedrooms] = useState(property?.bedrooms?.toString() ?? '');
  const [bathrooms, setBathrooms] = useState(property?.bathrooms?.toString() ?? '');
  const [area, setArea] = useState(property?.area_sqft?.toString() ?? '');
  const [price, setPrice] = useState(property?.price?.toString() ?? '');
  const [currency, setCurrency] = useState(property?.currency ?? 'AED');
  const [location, setLocation] = useState(property?.location ?? '');
  const [view, setView] = useState(property?.view ?? '');
  const [handoverDate, setHandoverDate] = useState(
    property?.handover_date ? property.handover_date.slice(0, 10) : ''
  );
  const [status, setStatus] = useState<PropertyRow['status']>(property?.status ?? 'available');
  const [isOffplan, setIsOffplan] = useState(property?.is_offplan ?? false);
  const [projectId, setProjectId] = useState(property?.project_id ?? '');
  const [planId, setPlanId] = useState(property?.payment_plan_id ?? '');
  // `properties.highlights` is a TEXT column in Postgres (not text[]). Older
  // rows may arrive as a plain string ("3BR · sea view · 2026 handover"), a
  // Postgres array literal ("{a,b,c}") or a JSON-encoded array. Coerce to
  // string[] so .join() / .filter() don't crash mid-render.
  const [highlights, setHighlights] = useState<string[]>(
    toStringArray(property?.highlights)
  );
  const [media, setMedia] = useState<string[]>(toStringArray(property?.media_urls));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function save() {
    setSaving(true);
    const payload = {
      reference: reference.trim() || null,
      type,
      bedrooms: bedrooms ? Number(bedrooms) : null,
      bathrooms: bathrooms ? Number(bathrooms) : null,
      area_sqft: area ? Number(area) : null,
      price: price ? Number(price) : null,
      currency: currency.trim() || 'AED',
      location: location.trim() || null,
      view: view.trim() || null,
      handover_date: handoverDate || null,
      status,
      is_offplan: isOffplan,
      project_id: projectId || null,
      payment_plan_id: planId || null,
      highlights: highlights.filter((h) => h.trim()),
      media_urls: media,
    };

    const res = await fetch(isEdit ? `/api/properties/${property!.id}` : '/api/properties', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(`فشل: ${j.error ?? 'unknown'}`);
      return;
    }
    toast.success(isEdit ? 'تم تحديث العقار' : 'تم إنشاء العقار');
    router.refresh();
    onClose();
  }

  async function destroy() {
    if (!property || !confirm('حذف العقار نهائياً؟')) return;
    setSaving(true);
    const res = await fetch(`/api/properties/${property.id}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      toast.error('لم نتمكن من الحذف');
      return;
    }
    toast.success('تم الحذف');
    router.refresh();
    onClose();
  }

  async function uploadFile(file: File) {
    // Brokers will be sending these via WhatsApp, where there's a 100MB/file
    // cap. We refuse anything larger client-side to save the round-trip.
    const MAX_BYTES = 90 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error(`الملف أكبر من 90MB — قسّمه أو اضغطه قبل الرفع.`);
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      // Tag the path by mime type folder so we can later prune the bucket
      // by category if it grows. Random suffix prevents collisions on
      // duplicate filenames across properties.
      const folder = file.type === 'application/pdf' ? 'pdf' : 'image';
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: uploadData, error } = await supabase.storage
        .from('property-media')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });
      if (error) {
        // Bucket may not exist yet — surface a useful message to the operator.
        toast.error(`فشل الرفع: ${error.message}`);
        return;
      }
      const { data: publicUrl } = supabase.storage
        .from('property-media')
        .getPublicUrl(uploadData.path);
      setMedia((prev) => [...prev, publicUrl.publicUrl]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl p-7"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="eyebrow mb-2">{isEdit ? 'EDIT · تعديل' : 'NEW · جديد'}</div>
            <h2 className="display-ar text-2xl" style={{ color: 'var(--ink)' }}>
              {isEdit ? `العقار ${property!.reference ?? ''}` : 'إضافة عقار'}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost h-9 w-9 p-0" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="المرجع / Reference">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="DUB-MAR-1234"
                className="input-boxed w-full"
              />
            </Field>
            <Field label="النوع / Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="input-boxed w-full"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="غرف نوم">
              <input
                type="number"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                placeholder="2"
                className="input-boxed w-full"
                step={0.5}
              />
            </Field>
            <Field label="حمّامات">
              <input
                type="number"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                placeholder="2"
                className="input-boxed w-full"
                step={0.5}
              />
            </Field>
            <Field label="المساحة (ft²)">
              <input
                type="number"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="1200"
                className="input-boxed w-full"
              />
            </Field>
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <Field label="السعر">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1500000"
                className="input-boxed w-full"
              />
            </Field>
            <Field label="العملة">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input-boxed w-full"
              >
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="QAR">QAR</option>
                <option value="KWD">KWD</option>
                <option value="BHD">BHD</option>
                <option value="OMR">OMR</option>
              </select>
            </Field>
          </div>

          <Field label="الموقع">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Dubai Marina, Tower 23"
              className="input-boxed w-full"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="الإطلالة">
              <input
                value={view}
                onChange={(e) => setView(e.target.value)}
                placeholder="Sea / Burj / Park / ..."
                className="input-boxed w-full"
              />
            </Field>
            <Field label="تاريخ التسليم">
              <input
                type="date"
                value={handoverDate}
                onChange={(e) => setHandoverDate(e.target.value)}
                className="input-boxed w-full"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="الحالة">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PropertyRow['status'])}
                className="input-boxed w-full"
              >
                <option value="available">متاح</option>
                <option value="reserved">محجوز</option>
                <option value="sold">مباع</option>
                <option value="off_market">خارج السوق</option>
              </select>
            </Field>

            <label className="flex items-end gap-2 cursor-pointer pb-2 pt-6">
              <input
                type="checkbox"
                checked={isOffplan}
                onChange={(e) => setIsOffplan(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                Off-plan (تحت الإنشاء)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="المشروع">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="input-boxed w-full"
              >
                <option value="">— بدون —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="خطة السداد">
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="input-boxed w-full"
              >
                <option value="">— بدون —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="المميزات (سطر لكل ميزة)">
            <textarea
              value={highlights.join('\n')}
              onChange={(e) =>
                setHighlights(e.target.value.split('\n').filter((s) => s.length > 0))
              }
              rows={4}
              placeholder="إطلالة بحرية\nمسبح خاص\nتشطيب فاخر"
              className="input-boxed w-full"
            />
          </Field>

          <Field label="الصور والكتيّبات (Brochures & media)">
            <div className="space-y-2">
              {media.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {media.map((url, i) => {
                    const isPdf = /\.pdf($|\?)/i.test(url) || /\/pdf\//i.test(url);
                    const filename = (() => {
                      try {
                        const u = new URL(url);
                        return decodeURIComponent(u.pathname.split('/').pop() ?? 'file');
                      } catch {
                        return 'file';
                      }
                    })();
                    return (
                      <div key={i} className="relative group">
                        {isPdf ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center justify-center w-full h-20 px-2 text-[10px] gap-1 text-center"
                            style={{
                              borderRadius: '3px',
                              border: '1px solid var(--rule)',
                              background: 'var(--paper-sink)',
                              color: 'var(--ink-soft)',
                              fontFamily: 'var(--font-mono)',
                            }}
                            title={filename}
                          >
                            <FileText className="w-4 h-4" />
                            <span className="truncate w-full" style={{ direction: 'ltr' }}>
                              {filename.length > 18 ? `${filename.slice(0, 15)}…pdf` : filename}
                            </span>
                          </a>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={url}
                            alt=""
                            className="w-full h-20 object-cover"
                            style={{ borderRadius: '3px', border: '1px solid var(--rule)' }}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setMedia(media.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white text-[10px] flex items-center justify-center rounded opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <label className="btn-ghost h-9 px-3 text-xs cursor-pointer w-fit gap-2">
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{uploading ? 'جارٍ الرفع...' : 'رفع صورة أو كتيّب (PDF)'}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                الصور وملفات PDF تُخزَّن في bucket <span style={{ fontFamily: 'var(--font-mono)' }}>property-media</span> على Supabase Storage. لازم البكت يكون مُنشأ ومسموح فيه القراءة العامة (Public bucket) عشان البوت يقدر يرسل الـ brochure للمشتري عبر واتساب.
              </p>
            </div>
          </Field>

          <div className="flex justify-between gap-2 pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
            <div>
              {isEdit && (
                <button
                  onClick={destroy}
                  disabled={saving}
                  className="btn-ghost h-10 px-4 text-sm gap-2"
                  style={{ color: 'var(--signal)', borderColor: 'var(--signal-soft)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف</span>
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost h-10 px-5 text-sm">
                إلغاء
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary h-10 px-5 text-sm gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEdit ? 'حفظ' : 'إنشاء'}</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
