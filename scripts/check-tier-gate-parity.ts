// ----------------------------------------------------------------------------
// CI parity lint — SUBSCRIPTION_PLAN.md §5.2 + §16
// ----------------------------------------------------------------------------
// The admin twin at anvira-admin-whatsapp/src/lib/tier-gates.ts and the
// backend canonical at anvira-backend/src/lib/tier-gates.ts MUST keep their
// FEATURE_MIN_TIER object byte-identical (modulo whitespace). The cross-repo
// correctness property is: admin pre-blocks the same set the backend would
// reject, so we never render a UI surface that the backend then 402s.
//
// This script reads both files as text, extracts the FEATURE_MIN_TIER block,
// normalises whitespace, and diffs. Exit 0 = parity. Exit 1 = drift (and the
// drift is printed to stderr).
//
// Run with:  npx tsx scripts/check-tier-gate-parity.ts
// CI hook:   wire into a pre-merge GitHub Action once Phase 2 lands.
// ----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import process from 'node:process';

const ADMIN_PATH = resolve(
  process.cwd(),
  'src',
  'lib',
  'tier-gates.ts'
);

// The backend repo lives sibling-to-sibling next to anvira-admin-whatsapp.
// Allow override via env so a monorepo move doesn't break the lint.
const BACKEND_PATH =
  process.env.BACKEND_TIER_GATES_PATH ??
  resolve(process.cwd(), '..', 'anvira-backend', 'src', 'lib', 'tier-gates.ts');

const FEATURE_MIN_TIER_RE =
  /export const FEATURE_MIN_TIER:\s*Record<TierFeature,\s*SubscriptionTier>\s*=\s*\{([\s\S]*?)\n\};/;

function extractMap(source: string, path: string): string {
  const m = source.match(FEATURE_MIN_TIER_RE);
  if (!m) {
    console.error(
      `[tier-gate-parity] FEATURE_MIN_TIER block not found in ${path}`
    );
    process.exit(2);
  }
  // Normalise: strip line comments + collapse all whitespace + drop trailing
  // commas. We're comparing meaning, not formatting.
  return m[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/,$/, ''))
    .sort()
    .join('\n');
}

let adminSrc: string;
let backendSrc: string;
try {
  adminSrc = readFileSync(ADMIN_PATH, 'utf8');
} catch (err: any) {
  console.error(
    `[tier-gate-parity] failed to read admin tier-gates: ${err?.message ?? err}`
  );
  process.exit(2);
}
try {
  backendSrc = readFileSync(BACKEND_PATH, 'utf8');
} catch (err: any) {
  console.error(
    `[tier-gate-parity] failed to read backend tier-gates at ${BACKEND_PATH}: ${err?.message ?? err}`
  );
  console.error(
    `[tier-gate-parity] set BACKEND_TIER_GATES_PATH if the layout differs`
  );
  process.exit(2);
}

const adminMap = extractMap(adminSrc, ADMIN_PATH);
const backendMap = extractMap(backendSrc, BACKEND_PATH);

if (adminMap === backendMap) {
  console.log('[tier-gate-parity] OK — FEATURE_MIN_TIER is byte-identical');
  process.exit(0);
}

console.error('[tier-gate-parity] DRIFT — FEATURE_MIN_TIER does not match');
console.error('--- admin (' + ADMIN_PATH + ') ---');
console.error(adminMap);
console.error('--- backend (' + BACKEND_PATH + ') ---');
console.error(backendMap);
console.error(
  '[tier-gate-parity] reconcile both copies to the same set + ordering, then re-run.'
);
process.exit(1);
