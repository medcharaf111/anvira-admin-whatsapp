'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase sends the recovery token in the URL hash.
    // The supabase-js client auto-picks it up on init if present.
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error('كلمة المرور يجب أن تكون ٦ أحرف على الأقل');
    if (password !== confirm) return toast.error('كلمات المرور غير متطابقة');

    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);

    if (error) return toast.error(error.message);
    toast.success('تم تغيير كلمة المرور بنجاح!');
    router.push('/conversations');
    router.refresh();
  }

  if (!ready) {
    return (
      <div
        dir="rtl"
        className="min-h-dvh flex items-center justify-center bg-background p-4"
      >
        <div className="bg-card rounded-2xl shadow-lg p-8 border border-border max-w-md w-full text-center">
          <p className="text-muted-foreground text-lg">جارٍ التحقق من الرابط...</p>
          <p className="text-sm text-muted-foreground mt-2">
            إذا لم يحدث شيء، قد يكون الرابط منتهي الصلاحية.{' '}
            <a href="/login" className="text-primary hover:underline">
              ارجع لتسجيل الدخول
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-dvh flex items-center justify-center bg-background p-4"
    >
      <div className="bg-card rounded-2xl shadow-lg p-8 border border-border max-w-md w-full">
        <h1 className="text-2xl font-semibold text-primary mb-2">
          كلمة مرور جديدة
        </h1>
        <p className="text-muted-foreground mb-6">اكتب كلمة مرور جديدة لحسابك.</p>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور الجديدة</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              dir="ltr"
              className="h-12 text-base text-left"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              dir="ltr"
              className="h-12 text-base text-left"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-base font-medium"
          >
            {loading ? 'جارٍ التحديث…' : 'تغيير كلمة المرور'}
          </Button>
        </form>
      </div>
    </div>
  );
}
