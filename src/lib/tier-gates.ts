// ----------------------------------------------------------------------------
// Tier gates — admin twin (SUBSCRIPTION_PLAN.md §5.2)
// ----------------------------------------------------------------------------
// Standalone copy of the backend helper at
// anvira-backend/src/lib/tier-gates.ts. NOT a thin reference — the admin must
// decide gating BEFORE the network hop, otherwise we render forbidden UI
// surfaces that show a fail toast on submit.
//
// PARITY CONSTRAINT: FEATURE_MIN_TIER MUST stay byte-identical to the backend.
// The CI lint at anvira-admin-whatsapp/scripts/check-tier-gate-parity.ts
// snapshots both and fails the build on drift.
// ----------------------------------------------------------------------------

export type SubscriptionTier =
  | 'pilot'
  | 'team'
  | 'brokerage'
  | 'enterprise'
  | 'grandfather'
  | 'suspended';

export type TierFeature =
  | 'kyc_workflow'
  | 'sanctions_screening'
  | 'goaml_export'
  | 'rera_forms'
  | 'payment_plan_pdf'
  | 'financing_router'
  | 'multi_branch_numbers'
  | 'custom_evolution_url'
  | 'role_admin'
  | 'role_agent'
  | 'role_viewer'
  | 'team_invitations'
  | 'audit_log_read'
  | 'sla_alerts';

export interface TierGateContext {
  id: string;
  subscription_tier: SubscriptionTier;
  subscription_status: string;
  current_period_end: string | null;
}

// pilot + grandfather get everything. suspended tier is a sticky lockout
// (refuse all features regardless of status).
export const TIER_RANK: Record<SubscriptionTier, number> = {
  pilot: 99,
  grandfather: 99,
  enterprise: 3,
  brokerage: 2,
  team: 1,
  suspended: -1,
};

// PARITY CONSTRAINT: this object MUST stay byte-identical to the same
// constant in anvira-backend/src/lib/tier-gates.ts. The CI lint at
// scripts/check-tier-gate-parity.ts diffs both and fails the build on drift.
export const FEATURE_MIN_TIER: Record<TierFeature, SubscriptionTier> = {
  // Team baseline (no premium features at all today)
  // Brokerage
  payment_plan_pdf: 'brokerage',
  financing_router: 'brokerage',
  rera_forms: 'brokerage',
  multi_branch_numbers: 'brokerage', // first number free at any tier; >1 needs Brokerage+
  team_invitations: 'brokerage',
  role_agent: 'brokerage',
  audit_log_read: 'brokerage',
  // Enterprise
  kyc_workflow: 'enterprise',
  sanctions_screening: 'enterprise',
  goaml_export: 'enterprise',
  custom_evolution_url: 'enterprise',
  sla_alerts: 'enterprise',
  role_admin: 'enterprise',
  role_viewer: 'enterprise',
};

const FEATURE_BLOCK_MODE: Record<TierFeature, 'hard' | 'soft'> = {
  // Hard: compliance/security/privilege. Silent allow = regression.
  kyc_workflow: 'hard',
  sanctions_screening: 'hard',
  goaml_export: 'hard',
  custom_evolution_url: 'hard',
  team_invitations: 'hard',
  role_admin: 'hard',
  role_viewer: 'hard',
  // Soft: revenue features. Better to over-deliver during pilot than break.
  payment_plan_pdf: 'soft',
  financing_router: 'soft',
  rera_forms: 'soft',
  multi_branch_numbers: 'soft',
  role_agent: 'soft',
  audit_log_read: 'soft',
  sla_alerts: 'soft',
};

export class TierNotAllowedError extends Error {
  readonly code = 'tier_not_allowed';
  readonly feature: TierFeature;
  readonly currentTier: SubscriptionTier;
  readonly requiredTier: SubscriptionTier;
  constructor(
    feature: TierFeature,
    currentTier: SubscriptionTier,
    requiredTier: SubscriptionTier
  ) {
    super(`feature_${feature}_requires_${requiredTier}_have_${currentTier}`);
    this.name = 'TierNotAllowedError';
    this.feature = feature;
    this.currentTier = currentTier;
    this.requiredTier = requiredTier;
  }
}

export function tierAllows(
  client: TierGateContext,
  feature: TierFeature
): boolean {
  if (client.subscription_status === 'cancelled') return false;
  if (client.subscription_tier === 'suspended') return false;
  if (
    client.subscription_tier === 'pilot' ||
    client.subscription_tier === 'grandfather'
  )
    return true;
  return TIER_RANK[client.subscription_tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]];
}

export function blockMode(feature: TierFeature): 'hard' | 'soft' {
  const envOverride = process.env.TIER_ENFORCEMENT_MODE;
  if (envOverride === 'hard') return 'hard';
  if (envOverride === 'soft') return 'soft';
  return FEATURE_BLOCK_MODE[feature];
}

export function requireTier(
  client: TierGateContext,
  feature: TierFeature
): void {
  if (!tierAllows(client, feature)) {
    throw new TierNotAllowedError(
      feature,
      client.subscription_tier,
      FEATURE_MIN_TIER[feature]
    );
  }
}

export function isUnsupportedTier(err: unknown): err is TierNotAllowedError {
  return (
    err instanceof TierNotAllowedError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === 'tier_not_allowed')
  );
}

// Enterprise was capped at 50 historically — the public pricing page sells
// "unlimited agent seats" for this tier, so the cap is bumped to the same
// 999 sentinel used by pilot + grandfather. Code now matches marketing.
// Parity copy: anvira-backend/src/lib/tier-gates.ts must mirror this.
export const TIER_MAX_AGENTS: Record<SubscriptionTier, number> = {
  pilot: 999,
  grandfather: 999,
  enterprise: 999,
  brokerage: 20,
  team: 5,
  suspended: 0,
};

export const TIER_MAX_CONVERSATIONS_MONTHLY: Record<SubscriptionTier, number> = {
  pilot: 999_999,
  grandfather: 999_999,
  enterprise: 999_999,
  brokerage: 10_000,
  team: 2_000,
  suspended: 0,
};

export const TIER_MAX_WA_NUMBERS: Record<SubscriptionTier, number> = {
  pilot: 999,
  grandfather: 999,
  enterprise: 999,
  brokerage: 3,
  team: 1,
  suspended: 0,
};

/** Shape of the typed 402 body returned by admin route handlers when they
 *  catch a TierNotAllowedError from the backend or from a local requireTier
 *  call. Per §5.3 / §6 — typed for the upgrade modal + banner UI. */
export interface TierNotAllowedBody {
  error: 'tier_not_allowed';
  feature: TierFeature;
  current_tier: SubscriptionTier;
  required_tier: SubscriptionTier;
  upgrade_url: string;
}

/** Build the typed 402 body for a TierNotAllowedError caught at the route
 *  handler boundary. */
export function tierNotAllowedBody(err: TierNotAllowedError): TierNotAllowedBody {
  return {
    error: 'tier_not_allowed',
    feature: err.feature,
    current_tier: err.currentTier,
    required_tier: err.requiredTier,
    upgrade_url: '/settings/billing',
  };
}
