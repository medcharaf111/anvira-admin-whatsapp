// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §5.0 — StatusChip
//
// Wraps the .pill CSS primitive into a reusable component keyed off the
// SubscriptionStatus enum. Carries a leading dot (.pill-dot) for at-a-
// glance scannability in the tenants list.
// ----------------------------------------------------------------------------

import type { SubscriptionStatus } from '@/app/api/platform-admin/tenants/route';

const STATUS_LABEL_AR: Record<SubscriptionStatus, string> = {
  pilot: 'تجريبي',
  trialing: 'تحت التجربة',
  active: 'نشط',
  past_due: 'متأخر',
  suspended: 'موقوف',
  cancelled: 'ملغى',
};

const STATUS_VARIANT: Record<SubscriptionStatus, string> = {
  pilot: 'pill-idle',
  trialing: 'pill-warn',
  active: 'pill-success',
  past_due: 'pill-warn',
  suspended: 'pill-signal',
  cancelled: 'pill-signal',
};

export function StatusChip({ status }: { status: SubscriptionStatus }) {
  // Defensive fallback: if the DB later acquires a new enum value that
  // this build doesn't know about yet, we render the raw value with the
  // neutral idle variant instead of `pill undefined` + an empty label.
  const variant = STATUS_VARIANT[status] ?? 'pill-idle';
  const label = STATUS_LABEL_AR[status] ?? status;
  return (
    <span className={`pill ${variant}`}>
      <span className="pill-dot" />
      <span>{label}</span>
    </span>
  );
}
