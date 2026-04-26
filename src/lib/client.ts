import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface CurrentClient {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  wa_number: string | null;
  is_sandbox: boolean;
  business_timezone: string;
  default_calendar_id: string | null;
}

/**
 * Resolve the currently logged-in operator's client (tenant).
 *
 * Returns null if the user has no client yet (new signup).
 * Server pages should call this and redirect to /onboarding when null.
 */
export async function getCurrentClient(): Promise<CurrentClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('dashboard_clients')
    .select(
      'id, slug, name, owner_id, wa_number, is_sandbox, business_timezone, default_calendar_id'
    )
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as CurrentClient) ?? null;
}

/**
 * Server-component helper. Returns the client or redirects.
 *
 * If user is not authed → /login.
 * If user has no client → /onboarding.
 */
export async function requireCurrentClient(): Promise<CurrentClient> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const client = await getCurrentClient();
  if (!client) redirect('/onboarding');
  return client;
}
