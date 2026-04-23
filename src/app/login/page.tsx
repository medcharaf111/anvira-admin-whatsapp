'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    router.push('/conversations');
    router.refresh();
  }

  async function onForgotPassword() {
    if (!email.trim()) return toast.error('اكتب بريدك الإلكتروني أولاً');
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    setResetSent(true);
    toast.success('تم إرسال رابط إعادة التعيين إلى بريدك.');
  }

  return (
    <div
      dir="rtl"
      className="relative min-h-dvh flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--paper)' }}
    >
      {/* Atmospheric glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(47, 122, 77, 0.18), transparent 60%)',
        }}
      />

      {/* Grid bg — very subtle */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--rule-soft) 1px, transparent 1px), linear-gradient(90deg, var(--rule-soft) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      {/* Theme toggle — top left corner */}
      <div className="absolute top-6 left-6 z-20">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Wordmark */}
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
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', letterSpacing: '0.08em' }}
          >
            OPERATOR
          </span>
        </div>

        {/* Card */}
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
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              SIGN IN · تسجيل الدخول
            </div>
            <h1
              className="display-ar text-2xl"
              style={{ color: 'var(--ink)' }}
            >
              أهلاً، مجدداً.
            </h1>
          </div>

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
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
                className="input-field text-left"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary group w-full h-12 mt-4"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ تسجيل الدخول...</span>
                </>
              ) : (
                <>
                  <span>الدخول</span>
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onForgotPassword}
              className="w-full text-center text-xs link-anim"
              style={{ color: 'var(--ink-faint)' }}
            >
              {resetSent ? 'تم الإرسال — تحقق من بريدك' : 'نسيت كلمة المرور؟'}
            </button>
          </form>
        </div>

        <p
          className="text-center text-[11px] mt-6"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', letterSpacing: '0.08em' }}
        >
          ANVIRA · OPERATOR CONSOLE · V.1.0
        </p>
      </motion.div>
    </div>
  );
}
