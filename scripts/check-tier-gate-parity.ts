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

// 3.2 — also diff FEATURE_BLOCK_MODE (a soft-in-one-twin / hard-in-the-other
// mismatch means admin and backend disagree on whether a feature 402s) and
// the semantic core of tierAllows (status/tier bypass order — the
// cancelled-before-pilot precedence is load-bearing for the live pilot).
const BLOCK_MODE_RE =
  /const FEATURE_BLOCK_MODE:\s*Record<TierFeature,\s*'hard'\s*\|\s*'soft'>\s*=\s*\{([\s\S]*?)\n\};/;
const TIER_ALLOWS_RE =
  /export function tierAllows\([\s\S]*?\n\}/;

function extractBlock(
  source: string,
  re: RegExp,
  label: string,
  path: string
): string {
  const m = source.match(re);
  if (!m) {
    console.error(`[tier-gate-parity] ${label} block not found in ${path}`);
    process.exit(2);
  }
  return (m[1] ?? m[0])
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/,$/, ''))
    .join('\n');
}

const checks: Array<[name: string, admin: string, backend: string]> = [
  ['FEATURE_MIN_TIER', adminMap, backendMap],
  [
    'FEATURE_BLOCK_MODE',
    // sorted like FEATURE_MIN_TIER — order-insensitive
    extractBlock(adminSrc, BLOCK_MODE_RE, 'FEATURE_BLOCK_MODE', ADMIN_PATH)
      .split('\n').sort().join('\n'),
    extractBlock(backendSrc, BLOCK_MODE_RE, 'FEATURE_BLOCK_MODE', BACKEND_PATH)
      .split('\n').sort().join('\n'),
  ],
  [
    'tierAllows',
    extractBlock(adminSrc, TIER_ALLOWS_RE, 'tierAllows', ADMIN_PATH),
    extractBlock(backendSrc, TIER_ALLOWS_RE, 'tierAllows', BACKEND_PATH),
  ],
];

let drift = false;
for (const [name, a, b] of checks) {
  if (a === b) {
    console.log(`[tier-gate-parity] OK — ${name} matches`);
    continue;
  }
  drift = true;
  console.error(`[tier-gate-parity] DRIFT — ${name} does not match`);
  console.error('--- admin (' + ADMIN_PATH + ') ---');
  console.error(a);
  console.error('--- backend (' + BACKEND_PATH + ') ---');
  console.error(b);
}

if (drift) {
  console.error(
    '[tier-gate-parity] reconcile both copies to the same set + semantics, then re-run.'
  );
  process.exit(1);
}
process.exit(0);
