import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { redirect } from 'next/navigation';
import { OnboardingForm } from './onboarding-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // If they already have a client, send them to the app
  const existing = await getCurrentClient();
  if (existing) redirect('/conversations');

  return (
    <div
      dir="rtl"
      className="min-h-dvh flex items-center justify-center px-6 py-10"
      style={{ background: 'var(--paper)' }}
    >
      <div
        className="w-full max-w-lg p-8 sm:p-10"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--primary-glow)' }}
          />
          <span className="eyebrow">إعداد جديد</span>
        </div>
        <h1
          className="display-ar text-3xl sm:text-4xl mb-3"
          style={{ color: 'var(--ink)' }}
        >
          أهلاً بك في أنفيرا.
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--ink-soft)' }}>
          أخبرنا بمعلومات عملك لإنشاء حساب جديد. ستستطيع تعديل كل شيء لاحقاً
          من الإعدادات.
        </p>

        <OnboardingForm />
      </div>
    </div>
  );
}
