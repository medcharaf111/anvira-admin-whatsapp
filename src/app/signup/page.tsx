'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * /signup — brokerage owner creates the initial auth account before
 * going through /onboarding to create their tenant.
 *
 * Two completion paths depending on Supabase auth project config:
 *   - "Confirm email" ON   → signUp returns success + null session,
 *     user gets a confirmation email, clicks it, lands on /onboarding.
 *   - "Confirm email" OFF  → signUp returns session immediately,
 *     supabase-js stores it, we push to /onboarding right away.
 *
 * Team-invited members do NOT come through here — they use
 * /invitations/[token] which auto-creates the auth user with
 * email_confirm=true via the backend service role.
 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentVerification, setSentVerification] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (password !== confirm) {
      toast.error('كلمتا المرور غير متطابقتين.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    // Two outcomes:
    //   1. Supabase project has email confirmation ON → no session yet,
    //      the user needs to click the confirmation link in their inbox.
    //   2. Email confirmation OFF → session is live, we can land them on
    //      /onboarding immediately.
    if (data.session) {
      router.push('/onboarding');
      router.refresh();
    } else {
      setSentVerification(true);
    }
  }

  return (
    <div
      dir="rtl"
      className="relative min-h-dvh flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--paper)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(47, 122, 77, 0.18), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--rule-soft) 1px, transparent 1px), linear-gradient(90deg, var(--rule-soft) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />
      <div className="absolute top-6 left-6 z-20">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--primary-glow)' }}
          />
          <span
            className="text-lg font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
          >
            أنفيرا
          </span>
          <span
            className="text-[11px]"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.08em',
            }}
          >
            OPERATOR
          </span>
        </div>

        <div
          className="px-8 py-10"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          <div className="mb-8">
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
              }}
            >
              SIGN UP · إنشاء حساب
            </div>
            <h1
              className="display-ar text-2xl"
              style={{ color: 'var(--ink)' }}
            >
              أنشئ حسابك الجديد.
            </h1>
            <p
              className="mt-2 text-xs"
              style={{ color: 'var(--ink-soft)' }}
            >
              للمكاتب العقارية الجديدة. لو وصلتك دعوة لفريق موجود، استخدم رابط
              الدعوة بدلاً من هذه الصفحة.
            </p>
          </div>

          {sentVerification ? (
            <div className="space-y-4">
              <div
                className="p-4 text-sm leading-relaxed"
                style={{
                  background: 'color-mix(in srgb, var(--primary-glow) 10%, var(--paper-sink))',
                  border: '1px solid color-mix(in srgb, var(--primary-glow) 40%, var(--rule))',
                  borderRadius: '3px',
                  color: 'var(--ink-soft)',
                }}
              >
                تم إرسال رابط تأكيد إلى{' '}
                <strong style={{ fontFamily: 'var(--font-mono)' }} dir="ltr">
                  {email}
                </strong>
                . اضغط الرابط في بريدك لتفعيل الحساب ثم سجّل الدخول.
              </div>
              <Link
                href="/login"
                className="btn-primary group w-full h-12 mt-2 inline-flex items-center justify-center"
              >
                <span>الذهاب لتسجيل الدخول</span>
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <div>
                <label className="field-label" htmlFor="email">
                  البريد الإلكتروني
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  className="input-field text-left"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.9rem',
                  }}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="password">
                  كلمة المرور
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  dir="ltr"
                  className="input-field text-left"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.9rem',
                  }}
                  placeholder="٨ أحرف على الأقل"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="confirm">
                  تأكيد كلمة المرور
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  dir="ltr"
                  className="input-field text-left"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.9rem',
                  }}
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={
                  loading || password.length < 8 || password !== confirm
                }
                className="btn-primary group w-full h-12 mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جارٍ الإنشاء...</span>
                  </>
                ) : (
                  <>
                    <span>أنشئ الحساب</span>
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                  </>
                )}
              </button>

              <div
                className="w-full text-center text-xs"
                style={{ color: 'var(--ink-faint)' }}
              >
                لديك حساب بالفعل؟{' '}
                <Link
                  href="/login"
                  className="link-anim"
                  style={{ color: 'var(--primary-glow)' }}
                >
                  سجّل الدخول
                </Link>
              </div>
            </form>
          )}
        </div>

        <p
          className="text-center text-[11px] mt-6"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.08em',
          }}
        >
          ANVIRA · OPERATOR CONSOLE · V.1.0
        </p>
      </motion.div>
    </div>
  );
}
