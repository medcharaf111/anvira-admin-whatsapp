// ----------------------------------------------------------------------------
// CI guard lint — PLATFORM_ADMIN_PLAN.md §8.1 (Gate 0–3 enforcement).
//
// Every route handler under src/app/api/platform-admin/ MUST wrap its
// exported HTTP method handlers in withSuperAdmin(...) from
// @/lib/platform-admin/guard. Forgetting the wrapper means the route
// would run with no auth gate — service-role keys exposed downstream.
//
// This script walks the api/platform-admin tree and FAILS the build if
// any route.ts (or route.tsx) exports a GET/POST/PUT/PATCH/DELETE
// without `withSuperAdmin` somewhere in the same file.
//
// Phase 1 ships this lint EVEN THOUGH no /api/platform-admin/* routes
// exist yet — landing the gate before the routes prevents the first
// Phase 2 PR from ever being merged unwrapped.
//
// Run with:  npx tsx scripts/check-platform-admin-guard.ts
// CI hook:   wire into package.json `prebuild` once tsx is installed.
// ----------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import process from 'node:process';

const PLATFORM_ADMIN_ROUTES = resolve(
  process.cwd(),
  'src',
  'app',
  'api',
  'platform-admin'
);

const HTTP_EXPORT_RE =
  /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const WITH_SUPER_ADMIN_RE = /withSuperAdmin\s*\(/;

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
      out = out.concat(walk(full));
    } else if (
      st.isFile() &&
      (full.endsWith('route.ts') || full.endsWith('route.tsx'))
    ) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  let dirExists = true;
  try {
    statSync(PLATFORM_ADMIN_ROUTES);
  } catch {
    dirExists = false;
  }

  if (!dirExists) {
    // No routes yet (Phase 1). That's fine — the lint passes.
    console.log(
      '[platform-admin-guard] no routes under src/app/api/platform-admin/ yet — OK'
    );
    process.exit(0);
  }

  const files = walk(PLATFORM_ADMIN_ROUTES);
  if (files.length === 0) {
    console.log('[platform-admin-guard] no route.ts files found — OK');
    process.exit(0);
  }

  const failures: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const exportedMethods = new Set<string>();
    for (const m of src.matchAll(HTTP_EXPORT_RE)) {
      exportedMethods.add(m[1]);
    }
    if (exportedMethods.size === 0) continue;
    if (!WITH_SUPER_ADMIN_RE.test(src)) {
      failures.push(
        `${file} — exports ${[...exportedMethods].join(', ')} but does not use withSuperAdmin()`
      );
    }
  }

  if (failures.length > 0) {
    console.error('[platform-admin-guard] FAIL — unwrapped route handlers:');
    for (const f of failures) console.error('  - ' + f);
    console.error(
      '[platform-admin-guard] every /api/platform-admin/* handler must wrap its export in withSuperAdmin(...) from @/lib/platform-admin/guard'
    );
    process.exit(1);
  }

  console.log(
    `[platform-admin-guard] OK — ${files.length} route file(s) all wrapped in withSuperAdmin`
  );
  process.exit(0);
}

main();
