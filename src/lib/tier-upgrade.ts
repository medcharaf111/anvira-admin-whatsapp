// ----------------------------------------------------------------------------
// 3.2 — shared 402 / tier_not_allowed response handling (client-side).
// ----------------------------------------------------------------------------
// Until this existed, a hard tier block rendered as a generic "unknown error"
// toast — guaranteed to be misdiagnosed as an outage the first time a
// downgraded tenant hits a gated surface. Every fetch site that can receive
// the typed 402 body (from gateAdminRoute / the backend's applyTierGate)
// should run its !res.ok branch through parseTierBlock first.

export interface TierBlock {
  feature: string;
  current_tier: string;
  required_tier: string;
  upgrade_url: string;
}

const TIER_LABEL: Record<string, string> = {
  team: 'Team',
  brokerage: 'Brokerage',
  enterprise: 'Enterprise',
  pilot: 'Pilot',
  grandfather: 'Grandfather',
  suspended: 'Suspended',
};

const FEATURE_LABEL_AR: Record<string, string> = {
  kyc_workflow: 'سير عمل التحقق (KYC)',
  sanctions_screening: 'فحص العقوبات',
  goaml_export: 'تصدير goAML',
  rera_forms: 'نماذج RERA',
  payment_plan_pdf: 'خطة الدفع PDF',
  financing_router: 'موجّه التمويل',
  multi_branch_numbers: 'أرقام الفروع المتعددة',
  team_invitations: 'دعوات الفريق',
  role_admin: 'دور المشرف',
  role_agent: 'دور الوكيل',
  role_viewer: 'دور المشاهد',
  audit_log_read: 'سجل التدقيق',
  multi_language: 'لغات إضافية',
};

/** Returns the typed tier block when the response is a tier 402, else null.
 *  Callers pass the already-parsed JSON body (every site parses it anyway). */
export function parseTierBlock(
  status: number,
  body: unknown
): TierBlock | null {
  if (status !== 402) return null;
  const b = body as { error?: string } & Partial<TierBlock>;
  if (b?.error !== 'tier_not_allowed') return null;
  return {
    feature: b.feature ?? 'unknown',
    current_tier: b.current_tier ?? 'unknown',
    required_tier: b.required_tier ?? 'brokerage',
    upgrade_url: b.upgrade_url ?? '/settings/billing',
  };
}

/** Bilingual one-liner for toast surfaces (panel rendering comes later). */
export function tierBlockMessage(block: TierBlock): string {
  const featureAr = FEATURE_LABEL_AR[block.feature] ?? block.feature;
  const need = TIER_LABEL[block.required_tier] ?? block.required_tier;
  return `هذه الميزة (${featureAr}) تتطلب باقة ${need} — ترقَّ من إعدادات الفوترة · This feature requires the ${need} plan`;
}
