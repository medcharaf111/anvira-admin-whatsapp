// ----------------------------------------------------------------------------
// Tier gates — SERVER-ONLY half (3.2 review fix).
// ----------------------------------------------------------------------------
// logTierGateEvent needs the service-role Supabase client, whose module pulls
// next/headers — importing it (even dynamically) from tier-gates.ts broke
// `next build` because tier-gates.ts is also consumed by client components
// (change-tier-modal, audit page banner). Next's static analysis follows
// dynamic imports, so the split must be at module level: tier-gates.ts stays
// pure (types, matrices, tierAllows, blockMode), and everything that touches
// the DB lives here. Route handlers import from THIS module; client
// components must never.

import { createServiceClient } from '@/lib/supabase/server';
import {
  tierAllows,
  blockMode,
  FEATURE_MIN_TIER,
  TierNotAllowedError,
  type TierFeature,
  type TierGateContext,
  type SubscriptionTier,
  type TierNotAllowedBody,
} from './tier-gates';

export type TierGateOutcome =
  | 'hard_block'
  | 'soft_skip'
  | 'resource_limit'
  | 'pilot_grandfathered';

// Per-instance dedupe. On Vercel serverless this under-dedupes across cold
// starts (each instance has its own Map) — accepted: worst case is extra
// telemetry rows, never dropped gates. The backend's row is the durable one.
const _dedupe = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60 * 60_000;

export async function logTierGateEvent(evt: {
  clientId: string;
  feature: TierFeature;
  currentTier: SubscriptionTier;
  requiredTier: SubscriptionTier;
  outcome: TierGateOutcome;
}): Promise<void> {
  try {
    const key = `${evt.clientId}:${evt.feature}:${evt.outcome}:admin_ui`;
    const now = Date.now();
    const last = _dedupe.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
    _dedupe.set(key, now);
    const svc = createServiceClient();
    await svc.from('tier_gate_events').insert({
      client_id: evt.clientId,
      feature: evt.feature,
      current_tier: evt.currentTier,
      required_tier: evt.requiredTier,
      outcome: evt.outcome,
      surface: 'admin_ui',
    });
  } catch (err) {
    console.warn('[tier-gates] telemetry insert failed:', err);
  }
}

/** Mode-aware requireTier — byte-mirrors the backend twin's semantics: soft
 *  -> telemetry + return normally; hard -> telemetry + throw the typed error. */
export function requireTier(
  client: TierGateContext,
  feature: TierFeature
): void {
  if (tierAllows(client, feature)) return;
  const requiredTier = FEATURE_MIN_TIER[feature];
  const mode = blockMode(feature);
  if (mode === 'soft') {
    void logTierGateEvent({
      clientId: client.id,
      feature,
      currentTier: client.subscription_tier,
      requiredTier,
      outcome: 'soft_skip',
    });
    return;
  }
  void logTierGateEvent({
    clientId: client.id,
    feature,
    currentTier: client.subscription_tier,
    requiredTier,
    outcome: 'hard_block',
  });
  throw new TierNotAllowedError(
    feature,
    client.subscription_tier,
    requiredTier
  );
}

/** Single adjudication helper for admin route handlers (analog of the
 *  backend's applyTierGate). Returns the typed 402 body when the request must
 *  be refused, or null when it proceeds (allowed, or below-tier under soft —
 *  which still logs a soft_skip row). */
export function gateAdminRoute(
  client: TierGateContext,
  feature: TierFeature
): TierNotAllowedBody | null {
  if (tierAllows(client, feature)) return null;
  const requiredTier = FEATURE_MIN_TIER[feature];
  if (blockMode(feature) === 'soft') {
    void logTierGateEvent({
      clientId: client.id,
      feature,
      currentTier: client.subscription_tier,
      requiredTier,
      outcome: 'soft_skip',
    });
    return null;
  }
  void logTierGateEvent({
    clientId: client.id,
    feature,
    currentTier: client.subscription_tier,
    requiredTier,
    outcome: 'hard_block',
  });
  return {
    error: 'tier_not_allowed',
    feature,
    current_tier: client.subscription_tier,
    required_tier: requiredTier,
    upgrade_url: '/settings/billing',
  };
}
