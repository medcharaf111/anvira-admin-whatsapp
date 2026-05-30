// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §3.3 — features-lost diff
// helper for the tier-change RPC + UI surface.
//
// Computes the set of TierFeature codes a tenant loses when moving from
// fromTier → toTier. The RPC at public.set_billing_tier_admin accepts a
// pre-computed p_features_lost text[] (see migration 20260618000000
// §3.7 docstring) precisely because the FEATURE_MIN_TIER map lives in
// TypeScript, not the database. The caller MUST compute it; the SQL
// editor break-glass path defaults to '{}' which loses the impact
// signal but never blocks the mutation.
//
// Admin-only consumer: lives under src/lib/platform-admin/ so the
// no-service-role-leak lint allow-list covers it, and so we don't have
// to touch the byte-parity-pinned anvira-backend/src/lib/tier-gates.ts
// for a helper only the admin app calls. The function re-implements the
// TIER_RANK comparison locally; FEATURE_MIN_TIER is imported from the
// existing twin and stays the single source of truth.
//
// Used by:
//   * POST /api/platform-admin/tenants/[id]/tier   (Implementer B, Deliv 3)
//   * ChangeTierModal "what the tenant loses"      (Implementer D, Deliv 5)
// ----------------------------------------------------------------------------

import {
  FEATURE_MIN_TIER,
  type SubscriptionTier,
  type TierFeature,
} from '@/lib/tier-gates';

/**
 * Mirror of the (un-exported) TIER_RANK from tier-gates.ts. Kept in
 * lockstep here so we never widen tier-gates.ts's public surface for a
 * helper only one module needs. If TIER_RANK in tier-gates.ts ever
 * changes, both copies must be updated.
 *
 * pilot / grandfather rank 99 — they own every feature.
 * suspended rank -1 — sticky lockout, loses everything.
 */
const TIER_RANK: Record<SubscriptionTier, number> = {
  pilot: 99,
  grandfather: 99,
  enterprise: 3,
  brokerage: 2,
  team: 1,
  suspended: -1,
};

/**
 * Returns the list of TierFeature codes the tenant had at `fromTier`
 * but loses at `toTier`. Empty array when the move is a sideways jump
 * or an upgrade.
 *
 * The list is deterministic in declaration order of FEATURE_MIN_TIER
 * so the rendered "what they lose" list stays stable across renders.
 */
export function featuresLostBetween(
  fromTier: SubscriptionTier,
  toTier: SubscriptionTier,
): TierFeature[] {
  if (TIER_RANK[toTier] >= TIER_RANK[fromTier]) return [];
  return (Object.entries(FEATURE_MIN_TIER) as [TierFeature, SubscriptionTier][])
    .filter(([, minTier]) => {
      const fromAllows = TIER_RANK[fromTier] >= TIER_RANK[minTier];
      const toAllows = TIER_RANK[toTier] >= TIER_RANK[minTier];
      return fromAllows && !toAllows;
    })
    .map(([feature]) => feature);
}

/**
 * True when moving from `fromTier` → `toTier` constitutes a downgrade.
 * Suspension is always treated as a downgrade regardless of source —
 * matches the modal's "DOWNGRADE" chip + acknowledgement-required logic.
 */
export function isDowngrade(
  fromTier: SubscriptionTier,
  toTier: SubscriptionTier,
): boolean {
  if (toTier === 'suspended') return true;
  return TIER_RANK[toTier] < TIER_RANK[fromTier];
}
