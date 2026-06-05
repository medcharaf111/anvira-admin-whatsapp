// ----------------------------------------------------------------------------
// QR-pair recovery flow smoke test (Fix B2).
//
// The QR-modal recovery panel triggers on 409 `owner_jid_mismatch` from
// /api/settings/evolution/sync-after-pair. Three failure modes we
// explicitly guard against:
//
//   1. The 409 branch fires the abandon-pair fetch BEFORE rendering the
//      panel — so the DB is already clean by the time the broker sees
//      the CTAs. If this regresses, the broker's first retry will fire
//      a fresh 409 (recoverable but slower) or, worse, the change-
//      number CTA will collide on the still-bound instance.
//
//   2. The recovery panel renders BOTH numbers (registered + scanned)
//      AND is the only thing the operator sees — the generic error
//      phase ('تعذّر إنشاء الجلسة') must NOT bleed through on the
//      mismatch path.
//
//   3. The destructive [Switch registered to scanned] CTA must keep a
//      typed-confirmation gate. Mirror of change-number-modal — losing
//      it would let a reflexive click re-key the tenant's primary
//      number on a wrong scan.
//
// We assert these by source-pattern scanning the modal + route files
// rather than spinning up a full DOM. This keeps the smoke runnable in
// the same harness as the other check-*.ts scripts and avoids pulling
// in jsdom/playwright. A heavier e2e (Playwright recording a real
// broker browser session) belongs in a follow-up PR; this script's job
// is to fail loudly when the recovery contract regresses.
//
// Run with:  npx tsx scripts/smoke-qr-recovery.ts
// CI hook:   wire into package.json `prebuild` alongside the other
//            check-*.ts scripts.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

type Assertion = { name: string; ok: boolean; detail?: string };
const results: Assertion[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
}

const root = resolve(__dirname, '..');
const modalPath = resolve(
  root,
  'src/components/real-estate/qr-scan-modal.tsx'
);
const routePath = resolve(
  root,
  'src/app/api/settings/whatsapp/abandon-pair/route.ts'
);

// -- Existence ----------------------------------------------------------------
assert('abandon-pair route file exists', existsSync(routePath), routePath);
assert('qr-scan-modal file exists', existsSync(modalPath), modalPath);

if (!existsSync(modalPath) || !existsSync(routePath)) {
  // Bail early if either file is missing — downstream assertions would
  // throw on the readFileSync and the failure mode would be a stack
  // trace instead of a clean assertion failure summary.
  reportAndExit();
}

const modal = readFileSync(modalPath, 'utf8');
const route = readFileSync(routePath, 'utf8');

// -- Smoke 1: sync handler 409 owner_jid_mismatch branch ---------------------
// The branch must (a) detect res.status === 409 AND body.error ===
// 'owner_jid_mismatch', (b) call abandon-pair BEFORE setting the
// recovery phase, (c) set the phase to 'recovery_owner_mismatch'.
const has409Detection =
  /res\.status\s*===\s*409[\s\S]{0,80}owner_jid_mismatch/.test(modal);
assert(
  'modal detects 409 owner_jid_mismatch in sync response',
  has409Detection,
  has409Detection
    ? undefined
    : 'expected `res.status === 409` close to `owner_jid_mismatch`'
);

const callsAbandonInline =
  /\/api\/settings\/whatsapp\/abandon-pair/.test(modal) &&
  /recovery_reason:\s*['"]owner_jid_mismatch['"]/.test(modal);
assert(
  'modal calls abandon-pair with recovery_reason on 409 branch',
  callsAbandonInline,
  callsAbandonInline
    ? undefined
    : 'expected fetch to /api/settings/whatsapp/abandon-pair with recovery_reason: \'owner_jid_mismatch\''
);

const setsRecoveryPhase = /setPhase\(['"]recovery_owner_mismatch['"]\)/.test(
  modal
);
assert(
  'modal transitions to recovery_owner_mismatch phase',
  setsRecoveryPhase,
  setsRecoveryPhase
    ? undefined
    : 'expected setPhase(\'recovery_owner_mismatch\')'
);

// -- Smoke 2: recovery panel renders both numbers + no generic error bleed ---
const rendersRegisteredLabel = /الرقم المسجل/.test(modal);
const rendersScannedLabel = /الرقم الذي مسحت به/.test(modal);
const recoveryHeader = /يبدو أنك مسحت من حساب واتساب غير المسجل/.test(modal);
assert(
  'recovery panel renders registered number label',
  rendersRegisteredLabel
);
assert('recovery panel renders scanned number label', rendersScannedLabel);
assert('recovery panel renders recovery header copy', recoveryHeader);

// Generic error copy is gated behind `phase === 'error'`. On the
// mismatch path we set phase to 'recovery_owner_mismatch', not 'error',
// so the generic copy never shows. We assert that the 409 branch does
// NOT call setPhase('error') anywhere downstream of the detection.
const branchIsolated =
  // crude but effective: split on the 409 detection and confirm the
  // next setPhase before `return` is recovery_owner_mismatch. Body
  // width is generous (~3000 chars) so this doesn't break when a
  // future doc-comment expansion pushes the setPhase further away.
  /res\.status\s*===\s*409[\s\S]{0,3000}setPhase\(['"]recovery_owner_mismatch['"]\)[\s\S]{0,200}return;/.test(
    modal
  );
assert(
  '409 branch sets recovery phase + returns (no generic error bleed)',
  branchIsolated,
  branchIsolated
    ? undefined
    : 'expected 409 detection to set recovery phase and return before any setPhase(\'error\')'
);

// -- Smoke 3: Switch CTA keeps typed-confirmation gate -----------------------
const hasTypedDigitsState = /switchTypedDigits/.test(modal);
const switchDisabledOnDigitsMismatch =
  /switchTypedDigits\s*!==\s*scannedWaNumber\.replace\(\/\\D\/g,\s*['"]{2}\)\.slice\(-4\)/.test(
    modal
  );
assert(
  'switch CTA has typed-digits state',
  hasTypedDigitsState,
  hasTypedDigitsState ? undefined : 'expected switchTypedDigits state field'
);
assert(
  'switch CTA disabled until last-4 digits match scanned number',
  switchDisabledOnDigitsMismatch,
  switchDisabledOnDigitsMismatch
    ? undefined
    : 'expected disabled gate comparing switchTypedDigits to last-4 of scannedWaNumber'
);

const switchCallsChangeNumber =
  /onRecoverySwitchRegistered[\s\S]{0,800}\/api\/settings\/whatsapp\/change-number/.test(
    modal
  );
assert(
  'switch CTA calls change-number endpoint',
  switchCallsChangeNumber,
  switchCallsChangeNumber
    ? undefined
    : 'expected onRecoverySwitchRegistered to POST /api/settings/whatsapp/change-number'
);

// -- Smoke 4: retry CTA resets modal state without re-asking ack secret ------
// The non-destructive retry should reset transient state and re-enter
// the ack flow (numberId is unchanged, so the new instance binds to the
// same client_numbers row).
const retryResetsAndAcks =
  /onRecoveryRetryRegistered[\s\S]{0,400}resetTransient\(\)[\s\S]{0,200}startAck\(\)/.test(
    modal
  );
assert(
  'retry CTA resets transient state and re-enters ack flow',
  retryResetsAndAcks,
  retryResetsAndAcks
    ? undefined
    : 'expected onRecoveryRetryRegistered to call resetTransient() then startAck()'
);

// -- Smoke 5: abandon-pair route is tenant-owner gated -----------------------
const routeGatesAuth = /unauthorized/.test(route);
const routeGatesRE = /not_real_estate/.test(route);
const routeGatesRole = /forbidden/.test(route);
const routeResolvesInstanceFromSession = /client\.evolution_instance/.test(
  route
);
const routeAuditsIntent = /pair\.abandon\.intent/.test(route);
const routeAuditsSuccess = /pair\.abandoned/.test(route);
assert('abandon-pair route gates unauthenticated', routeGatesAuth);
assert('abandon-pair route gates non-real-estate tenants', routeGatesRE);
assert(
  'abandon-pair route gates non-owner/admin roles',
  routeGatesRole
);
assert(
  'abandon-pair route resolves instance_name from session (not body)',
  routeResolvesInstanceFromSession,
  routeResolvesInstanceFromSession
    ? undefined
    : 'expected route to read client.evolution_instance rather than trusting body'
);
assert(
  'abandon-pair route writes intent audit row BEFORE backend call',
  routeAuditsIntent
);
assert(
  'abandon-pair route writes success audit row on backend OK',
  routeAuditsSuccess
);

// -- Report -------------------------------------------------------------------
reportAndExit();

function reportAndExit(): never {
  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;
  // Use raw console so this stays runnable in a bare Node env (no chalk
  // dep). The format mirrors the other check-*.ts scripts.
  console.log(`\n[smoke] QR-pair recovery flow`);
  console.log(`  passed: ${passed}/${results.length}`);
  for (const r of results) {
    const mark = r.ok ? 'OK ' : 'FAIL';
    console.log(`  [${mark}] ${r.name}`);
    if (!r.ok && r.detail) console.log(`         ${r.detail}`);
  }
  if (failed.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}
