// ----------------------------------------------------------------------------
// CI service-role leak lint — PLATFORM_ADMIN_PLAN.md §8.5.
//
// The service-role Supabase key bypasses RLS. Bundling it into the
// client JS would let any visitor read/write every tenant. Three rules:
//
//   1. No client-bundle file may reference SUPABASE_SERVICE_ROLE_KEY.
//   2. No client-bundle file may import createPlatformAdminServiceClient
//      OR call createServiceClient( from supabase/server.ts.
//   3. No file (anywhere) may name the env var with a NEXT_PUBLIC_ prefix
//      — that would bundle it into the client.
//
// "Client-bundle" = src/components/**/*.{ts,tsx} that aren't marked
// 'use server', plus any 'use client' file anywhere under src/.
//
// Server-only allow-list:
//   - src/lib/platform-admin/service-client.ts (the canonical home)
//   - src/lib/supabase/server.ts                (the legacy home)
//   - src/lib/platform-admin/*.ts               (server helpers)
//   - src/lib/audit.ts                          (server-only audit writer)
//   - src/app/api/**                            (route handlers)
//   - src/app/(app)/platform-admin/**           (RSC pages, see below)
//   - scripts/**                                (this lint itself)
//
// Run with:  npx tsx scripts/check-no-service-role-leak.ts
// CI hook:   wire into package.json `prebuild`.
// ----------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import process from 'node:process';

const SRC_ROOT = resolve(process.cwd(), 'src');

const SERVER_ALLOWLIST_PATTERNS: RegExp[] = [
  /^src[\\/]lib[\\/]platform-admin[\\/]/,
  /^src[\\/]lib[\\/]supabase[\\/]server\.ts$/,
  /^src[\\/]lib[\\/]audit\.ts$/,
  /^src[\\/]app[\\/]api[\\/]/,
  /^src[\\/]middleware\.ts$/,
  // Platform-admin RSC segment: pages here are server components by
  // convention (no 'use client' directive) and legitimately call the
  // service-role factory to avoid the RSC→same-process-API double-hop
  // anti-pattern. Any 'use client' file under this path is still flagged
  // by the isUseClient check above, which runs before the allow-list.
  /^src[\\/]app[\\/]\(app\)[\\/]platform-admin[\\/]/,
];

const SERVICE_ROLE_KEY_RE = /SUPABASE_SERVICE_ROLE_KEY\b/;
const BAD_NEXT_PUBLIC_RE = /NEXT_PUBLIC_[A-Z0-9_]*SERVICE[A-Z0-9_]*ROLE/;
const SERVICE_ROLE_LITERAL_RE = /['"`]service_role['"`]/;
const CREATE_SERVICE_CLIENT_RE =
  /\b(createServiceClient|createPlatformAdminServiceClient)\s*\(/;
const USE_CLIENT_RE = /^\s*['"]use client['"]/m;

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // skip .next + node_modules just in case the script is run from
      // an unexpected cwd
      if (name === 'node_modules' || name === '.next') continue;
      out = out.concat(walk(full));
    } else if (
      st.isFile() &&
      (full.endsWith('.ts') || full.endsWith('.tsx'))
    ) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlistedServerFile(relPath: string): boolean {
  for (const re of SERVER_ALLOWLIST_PATTERNS) {
    if (re.test(relPath)) return true;
  }
  return false;
}

function main() {
  let srcExists = true;
  try {
    statSync(SRC_ROOT);
  } catch {
    srcExists = false;
  }
  if (!srcExists) {
    console.error('[no-service-role-leak] src/ not found — run from repo root');
    process.exit(2);
  }

  const files = walk(SRC_ROOT);
  const failures: string[] = [];

  for (const file of files) {
    const rel = relative(process.cwd(), file).replace(/\//g, sep);
    const src = readFileSync(file, 'utf8');

    // Rule 3 — NEXT_PUBLIC_*SERVICE*ROLE is ALWAYS a fail, anywhere.
    if (BAD_NEXT_PUBLIC_RE.test(src)) {
      failures.push(
        `${rel} — references a NEXT_PUBLIC_*SERVICE*ROLE env var; service-role keys must NEVER be bundled`
      );
    }

    const referencesKey = SERVICE_ROLE_KEY_RE.test(src);
    const referencesLiteral = SERVICE_ROLE_LITERAL_RE.test(src);
    const callsServiceClient = CREATE_SERVICE_CLIENT_RE.test(src);
    const isUseClient = USE_CLIENT_RE.test(src);

    // Any 'use client' file referencing the key / literal / factory is a fail.
    if (isUseClient && (referencesKey || referencesLiteral || callsServiceClient)) {
      failures.push(
        `${rel} — 'use client' file references service-role machinery (key/literal/factory)`
      );
      continue;
    }

    // Non-allow-listed server files calling the factory or naming the key
    // are flagged as drift. Importing the type-only surface from
    // platform-admin/* is fine because the allowlist covers those paths.
    if (
      (referencesKey || callsServiceClient) &&
      !isAllowlistedServerFile(rel)
    ) {
      failures.push(
        `${rel} — server file outside the allow-list references service-role machinery; relocate the call into src/lib/platform-admin/ or src/app/api/`
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      '[no-service-role-leak] FAIL — service-role exposure surface:'
    );
    for (const f of failures) console.error('  - ' + f);
    console.error(
      '[no-service-role-leak] see PLATFORM_ADMIN_PLAN.md §8.5 for the contract'
    );
    process.exit(1);
  }

  console.log(
    `[no-service-role-leak] OK — scanned ${files.length} TS file(s); no leaks`
  );
  process.exit(0);
}

main();
