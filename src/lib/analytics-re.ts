import { createClient } from '@/lib/supabase/server';

/**
 * Real-estate specific analytics. Computed only when client_type is
 * 'real_estate' and rendered on /analytics in place of the clinic KPIs.
 *
 * Window: last 30 days for every metric. The dashboard already exposes
 * the clinic-style 7-day KPIs elsewhere; for RE the brokerage cadence is
 * a month-on-month story, so 30D is the headline window.
 */
export interface ReAnalytics {
  newLeads: number;
  avgLeadScore: number;
  leadToViewing: number; // 0-1
  viewingToClose: number; // 0-1
  stageCounts: Record<string, number>;
  sourceBreakdown: { source: string; count: number; pretty: string }[];
  sourceConversion: { source: string; rate: number; total: number; pretty: string }[];
  topDevelopers: { developer: string; count: number }[];
  topPropertyTypes: { type: string; count: number }[];
}

const STAGE_KEYS = [
  'cold',
  'warm',
  'hot',
  'viewing_booked',
  'deposited',
  'closed',
  'lost',
] as const;

function prettySource(src: string): string {
  if (!src) return 'UNKNOWN';
  if (src.startsWith('portal_')) {
    return src.slice('portal_'.length).replace(/_/g, ' ').toUpperCase();
  }
  return src.replace(/_/g, ' ').toUpperCase();
}

// H3b: conversion is grounded in the auditable high-water mark, never the
// live (human-mutable) lead_stage. A lead that REACHED viewing_booked counts
// even if it was later moved to 'lost' or re-opened. RANK MUST match
// crm_stage_rank() in the migration and STAGE_RANK in the admin leads route.
const RANK: Record<string, number> = {
  lost: 0, cold: 1, warm: 2, hot: 3, viewing_booked: 4, deposited: 5, closed: 6,
};
function reachedRank(c: { lead_stage: string | null; max_stage_reached: string | null }): string {
  return c.max_stage_reached ?? c.lead_stage ?? 'cold';
}
function reachedAtLeast(
  c: { lead_stage: string | null; max_stage_reached: string | null },
  stage: string
): boolean {
  return (RANK[reachedRank(c)] ?? 0) >= (RANK[stage] ?? 99);
}

export async function loadReAnalytics(clientId: string): Promise<ReAnalytics> {
  // H3b — NO invented ROI. There is no broker ad-spend column or input in the
  // schema/UI, so we render NO cost and NO ROI. The honest behavior is to omit
  // ROI entirely rather than impute a cost. If a real, broker-supplied spend
  // column is ever added (e.g. conversations.lead_source -> a source_spend
  // table), gate any ROI display on `spend != null && spend > 0` and compute
  // revenue/spend ONLY from those real figures. Do NOT wire analytics.ts
  // estimatedCostUSD (an imputed LLM/WA operating cost) into this surface.
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

  const [convRes, qualRes, propRes] = await Promise.all([
    // Conversations: stage, score, source over the last 30 days. A 50k
    // ceiling on a single brokerage is generous — typical Gulf operator
    // gets <2k portal leads/month.
    supabase
      .from('conversations')
      // H3b: read max_stage_reached (immutable high-water mark) for conversion.
      // lead_stage stays selected for the live stageCounts board only.
      .select('id, created_at, lead_stage, lead_score, lead_source, max_stage_reached')
      .eq('client_id', clientId)
      .gte('created_at', since)
      .limit(50_000),
    // Qualification rows for the same window — we only need
    // property_types_wanted to tokenize.
    supabase
      .from('leads_qualification')
      .select('property_types_wanted, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since)
      .limit(50_000),
    // Properties: developer attribution. Not time-windowed — operators
    // want to see "what developers are people asking about", which
    // mirrors the current property inventory better than time-bounded.
    supabase
      .from('properties')
      .select('developer, project_id, projects(developer)')
      .eq('client_id', clientId)
      .limit(2_000),
  ]);

  const convs = (convRes.data ?? []) as Array<{
    lead_stage: string | null;
    lead_score: number | null;
    lead_source: string | null;
    max_stage_reached: string | null;
  }>;

  // ── Headline numbers ─────────────────────────────────────────
  const newLeads = convs.length;
  const scored = convs.filter((c) => typeof c.lead_score === 'number');
  const avgLeadScore =
    scored.length === 0
      ? 0
      : Math.round(
          scored.reduce((s, c) => s + (c.lead_score ?? 0), 0) / scored.length
        );

  const stageCounts: Record<string, number> = {};
  for (const k of STAGE_KEYS) stageCounts[k] = 0;
  for (const c of convs) {
    const k = (c.lead_stage ?? 'cold') as string;
    if (k in stageCounts) stageCounts[k] = (stageCounts[k] ?? 0) + 1;
  }

  // Conversion ratios. Clamped so a few stuck stages don't blow them up.
  // H3b: conversion = count of leads whose HIGH-WATER mark reached the stage,
  // not who currently sits there. Bot-driven demotion can no longer deflate it.
  const viewings = convs.filter((c) => reachedAtLeast(c, 'viewing_booked')).length;
  const closes = convs.filter((c) => reachedAtLeast(c, 'closed')).length;
  const leadToViewing = newLeads === 0 ? 0 : Math.min(1, viewings / newLeads);
  const viewingToClose = viewings === 0 ? 0 : Math.min(1, closes / viewings);

  // ── Lead-source breakdown ────────────────────────────────────
  const srcTotals: Record<string, number> = {};
  const srcViewingsByKey: Record<string, number> = {};
  const srcClosesByKey: Record<string, number> = {};
  for (const c of convs) {
    const s = (c.lead_source ?? 'unknown').toString();
    srcTotals[s] = (srcTotals[s] ?? 0) + 1;
    // H3b: high-water mark, not live stage.
    if (reachedAtLeast(c, 'viewing_booked')) {
      srcViewingsByKey[s] = (srcViewingsByKey[s] ?? 0) + 1;
    }
    if (reachedAtLeast(c, 'closed')) {
      srcClosesByKey[s] = (srcClosesByKey[s] ?? 0) + 1;
    }
  }
  const sourceBreakdown = Object.entries(srcTotals)
    .map(([source, count]) => ({ source, count, pretty: prettySource(source) }))
    .sort((a, b) => b.count - a.count);

  const sourceConversion = Object.entries(srcTotals)
    .map(([source, total]) => {
      const wins =
        (srcViewingsByKey[source] ?? 0) + (srcClosesByKey[source] ?? 0);
      // Divide by total only; viewings already include closes, so we
      // count (viewings_or_better) / total as the "useful" rate.
      const useful = srcViewingsByKey[source] ?? 0;
      const rate = total === 0 ? 0 : Math.min(1, useful / total);
      return {
        source,
        rate,
        total,
        pretty: prettySource(source),
        // Reference `wins` so unused-var linters don't whine — exposes
        // the gross win count separately if a future view needs it.
        _wins: wins,
      };
    })
    .filter((r) => r.total >= 3) // hide tiny sources to avoid noisy 100% bars
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)
    .map(({ _wins, ...rest }) => rest); // strip internal field

  // ── Top developers ──────────────────────────────────────────
  const devCounts: Record<string, number> = {};
  for (const p of (propRes.data ?? []) as Array<{
    developer: string | null;
    projects: { developer?: string | null } | { developer?: string | null }[] | null;
  }>) {
    // Fall back to projects.developer when the property doesn't carry one.
    const fromProject = Array.isArray(p.projects)
      ? p.projects[0]?.developer ?? null
      : (p.projects as { developer?: string | null } | null)?.developer ?? null;
    const dev = (p.developer ?? fromProject ?? '').trim();
    if (!dev) continue;
    devCounts[dev] = (devCounts[dev] ?? 0) + 1;
  }
  const topDevelopers = Object.entries(devCounts)
    .map(([developer, count]) => ({ developer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Top property types requested (from qualification rows) ──
  const typeCounts: Record<string, number> = {};
  for (const q of (qualRes.data ?? []) as Array<{
    property_types_wanted: string[] | string | null;
  }>) {
    const raw = q.property_types_wanted;
    if (!raw) continue;
    const tokens = Array.isArray(raw)
      ? raw
      : String(raw)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    for (const tk of tokens) {
      const key = tk.toLowerCase().trim();
      if (!key) continue;
      typeCounts[key] = (typeCounts[key] ?? 0) + 1;
    }
  }
  const topPropertyTypes = Object.entries(typeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    newLeads,
    avgLeadScore,
    leadToViewing,
    viewingToClose,
    stageCounts,
    sourceBreakdown,
    sourceConversion,
    topDevelopers,
    topPropertyTypes,
  };
}
