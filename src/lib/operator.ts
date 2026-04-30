import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Founders / operator allowlist. Email match is case-insensitive.
 * Configure via OPERATOR_EMAILS env var (comma-separated).
 */
const OPERATOR_EMAILS = (process.env.OPERATOR_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.toLowerCase());
}

export async function isCurrentUserOperator(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isOperatorEmail(user?.email);
}

/**
 * Server-component / server-action helper. Redirects non-operators away.
 *  - not signed in → /login
 *  - signed in but not in allowlist → /conversations
 */
export async function requireOperator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!isOperatorEmail(user.email)) redirect('/conversations');
  return user;
}
