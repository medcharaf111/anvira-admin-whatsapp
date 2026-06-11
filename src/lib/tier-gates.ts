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
//
// 2026-06-02: AML/KYC/sanctions/goAML moved from Enterprise → Brokerage per
// Architect Brief §4 GTM-A (Decree-10 makes AML mandatory for the 6-20-agent
// Brokerage ICP; charging extra for legally-required compliance is coercive).
// Deep-CDD/risk-scoring/audit-pack/SAR-prep features added as dormant skeleton
// gated to 'enterprise'. They will move to a future 'compliance_pro' tier
// when pilots produce WTP signal.
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
  | 'sla_alerts'
  | 'multi_language'
  | 'deep_cdd_workflow'
  | 'risk_scoring'
  | 'audit_pack_export'
  | 'sar_prep_tooling';

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
  multi_language: 'brokerage', // Team = AR+EN only; 6-language pack is Brokerage+ per pricing page
  kyc_workflow: 'brokerage',
  sanctions_screening: 'brokerage',
  goaml_export: 'brokerage',
  // Enterprise
  custom_evolution_url: 'enterprise',
  sla_alerts: 'enterprise',
  role_admin: 'enterprise',
  role_viewer: 'enterprise',
  // Compliance Pro (dormant skeleton — gated to 'enterprise' until the future
  // 'compliance_pro' tier launches with pilot WTP signal)
  deep_cdd_workflow: 'enterprise',
  risk_scoring: 'enterprise',
  audit_pack_export: 'enterprise',
  sar_prep_tooling: 'enterprise',
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
  deep_cdd_workflow: 'hard',
  risk_scoring: 'hard',
  audit_pack_export: 'hard',
  sar_prep_tooling: 'hard',
  // Soft: revenue features. Better to over-deliver during pilot than break.
  payment_plan_pdf: 'soft',
  financing_router: 'soft',
  rera_forms: 'soft',
  multi_branch_numbers: 'soft',
  role_agent: 'soft',
  audit_log_read: 'soft',
  sla_alerts: 'soft',
  multi_language: 'soft', // revenue feature — over-deliver during pilot rather than break threads
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

/** Honour TIER_ENFORCEMENT_MODE env override (`'hard'` | `'soft'` |
 *  `'mixed'`); else fall back to the per-feature mode. NOTE: an UNSET env is
 *  the per-feature fall-through — de-facto MIXED. 3.2 hardening mirrors the
 *  backend twin: trim+lowercase (a typo'd 'Hard' used to silently land in
 *  mixed), accept 'mixed' explicitly, warn once on garbage. */
let _warnedBadMode = false;
export function blockMode(feature: TierFeature): 'hard' | 'soft' {
  const raw = process.env.TIER_ENFORCEMENT_MODE;
  const envOverride = (raw ?? '').trim().toLowerCase();
  if (envOverride === 'hard') return 'hard';
  if (envOverride === 'soft') return 'soft';
  if (envOverride !== '' && envOverride !== 'mixed' && !_warnedBadMode) {
    _warnedBadMode = true;
    console.warn(
      `[tier-gates] TIER_ENFORCEMENT_MODE='${raw}' is not one of soft|hard|mixed — falling through to per-feature (mixed) mode. Fix the env.`
    );
  }
  return FEATURE_BLOCK_MODE[feature];
}

// 3.2 review fix — requireTier, logTierGateEvent, and gateAdminRoute moved to
// tier-gates-server.ts. They need the service-role Supabase client (pulls
// next/headers), and THIS module is imported by client components
// (change-tier-modal, audit banner) — even a dynamic import here fails
// `next build`. This module must stay pure: types, matrices, tierAllows,
// blockMode, tierNotAllowedBody only.

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

// gateAdminRoute lives in tier-gates-server.ts (needs telemetry -> service
// client -> next/headers; would break the client bundle here).
