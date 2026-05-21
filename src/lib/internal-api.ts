/**
 * Helpers for proxying admin requests to the backend's internal API.
 *
 * The backend exposes `/internal/*` endpoints behind a shared-secret
 * header. The admin Next.js layer authenticates the operator, resolves
 * their tenant, then forwards the request with the proper headers.
 *
 * If the backend isn't configured (sandbox/dev) or the endpoint
 * returns 404 because the migration hasn't landed yet, we degrade
 * gracefully by returning `{ provisioned: false }` so the UI can
 * render its empty state without crashing.
 */
export interface InternalContext {
  backend: string | undefined;
  secret: string | undefined;
  clientId: string;
}

export function getInternalContext(clientId: string): InternalContext {
  return {
    backend: process.env.NEXT_PUBLIC_BACKEND_URL,
    secret: process.env.INTERNAL_SHARED_SECRET,
    clientId,
  };
}

/**
 * Lightweight wrapper around fetch() that adds the X-Internal-Secret
 * + X-Client-Id headers and treats "config missing" + "backend
 * returned 404" as a soft "not provisioned" outcome.
 *
 * Returns `{ provisioned: false }` when the backend hasn't shipped the
 * endpoint yet. Returns `{ provisioned: true, status, json }` in all
 * other cases (including 5xx — the caller decides what to do).
 */
export async function callInternal(
  ctx: InternalContext,
  path: string,
  init?: RequestInit
): Promise<
  | { provisioned: false }
  | { provisioned: true; status: number; ok: boolean; json: unknown }
> {
  const { backend, secret, clientId } = ctx;
  if (!backend || !secret) return { provisioned: false };

  try {
    const res = await fetch(`${backend}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
        'X-Internal-Secret': secret,
        'X-Client-Id': clientId,
      },
      cache: 'no-store',
    });
    // 404 from the backend means "this internal endpoint hasn't been
    // deployed yet" (Wave-3 migrations not run). Treat as the same
    // soft-failure as "not configured" so the admin UI can show a
    // helpful empty state.
    if (res.status === 404) return { provisioned: false };
    const json = await res.json().catch(() => null);
    return { provisioned: true, status: res.status, ok: res.ok, json };
  } catch {
    return { provisioned: false };
  }
}
