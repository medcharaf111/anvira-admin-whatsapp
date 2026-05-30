// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §5.0 — TierChip
//
// Wraps the .pill CSS primitive (defined in src/app/globals.css) into a
// reusable component keyed off the SubscriptionTier enum. Crown icon on
// 'enterprise' as a visual marker for the top tier. 'grandfather' uses
// pill-gold (preserved/legacy reading) because pill-faint is not defined
// in globals.css today.
// ----------------------------------------------------------------------------

import { Crown } from 'lucide-react';
import type { SubscriptionTier } from '@/app/api/platform-admin/tenants/route';

const TIER_LABEL_AR: Record<SubscriptionTier, string> = {
  pilot: 'تجريبي',
  team: 'فريق',
  brokerage: 'وساطة',
  enterprise: 'مؤسّسي',
  grandfather: 'مُورَّث',
  suspended: 'موقوف',
};

const TIER_VARIANT: Record<SubscriptionTier, string> = {
  pilot: 'pill-idle',
  team: 'pill-warn',
  brokerage: 'pill-success',
  enterprise: 'pill-success',
  grandfather: 'pill-gold',
  suspended: 'pill-signal',
};

export function TierChip({ tier }: { tier: SubscriptionTier }) {
  // Defensive fallback: if the DB later acquires a new enum value that
  // this build doesn't know about yet, we render the raw value with the
  // neutral idle variant instead of `pill undefined` + an empty label.
  const variant = TIER_VARIANT[tier] ?? 'pill-idle';
  const label = TIER_LABEL_AR[tier] ?? tier;
  return (
    <span className={`pill ${variant}`}>
      {tier === 'enterprise' && (
        <Crown size={11} style={{ marginInlineEnd: '0.25rem' }} aria-hidden />
      )}
      <span>{label}</span>
    </span>
  );
}
