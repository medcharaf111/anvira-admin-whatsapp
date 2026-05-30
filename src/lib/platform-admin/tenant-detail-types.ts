// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §1 — shared TypeScript
// contracts for the tenant-detail surface.
//
// One source of truth for the shapes consumed by:
//   * GET  /api/platform-admin/tenants/[id]          (Implementer B, Deliv 2)
//   * POST /api/platform-admin/tenants/[id]/tier     (Implementer B, Deliv 3)
//   * /platform-admin/tenants/[id] page              (Implementer C, Deliv 4)
//   * ChangeTierModal                                 (Implementer D, Deliv 5)
//   * Suspicious-pattern detector (audit row shape)  (Implementer E, Deliv 6)
//
// Why a dedicated module rather than re-exporting from the route file:
// the page (RSC) needs the types AND the modal (client component) needs
// them; route files cannot be safely imported into client bundles because
// they ship Node-only handlers, secrets, etc. This module is pure types —
// zero runtime — and therefore tree-shakes to nothing in both surfaces.
//
// PARITY NOTE: SubscriptionTier / SubscriptionStatus come from tier-gates
// (admin twin); keep the enum values in lockstep with tenants-query.ts so
// the list and detail surfaces speak the same vocabulary.
// ----------------------------------------------------------------------------

import type { SubscriptionTier } from '@/lib/tier-gates';
import type { SubscriptionStatus } from '@/lib/platform-admin/tenants-query';

export type { SubscriptionTier, SubscriptionStatus };

// ───── Tenant detail row ─────

export interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  country: 'UAE' | 'KSA' | null;
  client_type: 'real_estate' | 'clinic' | 'salon';
  /** e.g. "UAE_FEDERAL" | "DUBAI" | "KSA_RIYADH" — free-form for now */
  jurisdiction: string | null;
  business_timezone: string | null;
  wa_phone_number: string | null;
  kyc_enabled: boolean;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  pilot_ends_at: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  owner_email: string | null;
}

// ───── Tier change history (timeline rows) ─────

export interface TierChange {
  id: string;
  changed_at: string;
  from_tier: SubscriptionTier | null;
  to_tier: SubscriptionTier;
  from_status: SubscriptionStatus | null;
  to_status: SubscriptionStatus | null;
  actor_user_id: string | null;
  actor_email: string | null;
  reason: string | null;
  /** TierFeature[] serialised by the RPC */
  features_lost: string[];
  acknowledged_text: string | null;
  request_id: string | null;
}

// ───── Invoices ─────

export interface Invoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  /** numeric — keep as string to avoid float drift across the wire */
  amount: string;
  currency: 'AED' | 'SAR' | 'USD' | 'EUR' | 'GBP';
  tax_amount: string;
  tax_rate: string;
  status: 'issued' | 'paid' | 'void';
  due_date: string | null;
  pdf_url: string | null;
  issued_at: string;
  paid_at: string | null;
}

// ───── 30-day rollup counts ─────

export interface TenantCounts {
  agents: number;
  conversations_30d: number;
  leads_30d: number;
  kyc_cases_30d: number;
}

// ───── Compound response (GET /api/platform-admin/tenants/[id]) ─────

export interface TenantDetailResponse {
  tenant: TenantDetail;
  /** Most-recent 10 tier changes, newest first */
  recent_tier_changes: TierChange[];
  /** Most-recent 10 invoices, newest first. Empty during pilot. */
  recent_invoices: Invoice[];
  counts: TenantCounts;
}

// ───── POST /api/platform-admin/tenants/[id]/tier ─────

export interface ChangeTierRequest {
  to_tier: SubscriptionTier;
  /** If omitted the RPC keeps the current status (only when transition allows) */
  to_status?: SubscriptionStatus;
  /** >= 12 chars after trim */
  reason: string;
  /** Required on downgrades only — must exactly match ACK_PHRASE */
  acknowledged_text?: string;
}

export interface ChangeTierResponse {
  ok: true;
  tenant: TenantDetail;
  /** uuid of the inserted subscription_tier_changes row */
  audit_id: string;
}

export interface ChangeTierErrorResponse {
  ok: false;
  /** Machine code, e.g. 'reason_too_short', 'invalid_transition' */
  error: string;
  message?: string;
  /** Populated only on { error: 'invalid_transition' } responses */
  allowed_transitions?: SubscriptionStatus[];
}
