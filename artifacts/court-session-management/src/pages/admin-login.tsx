import React, { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { ShieldCheck, Lock, User, ArrowRight, ShieldAlert, KeyRound, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function AdminLoginPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!username.trim() || !password.trim()) {
      setErrorMsg('اسم المشرف وكلمة المرور مطلوبان.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل دخول المشرف');
      }

      toast({
        title: 'أهلاً بك يا مدير النظام 👑',
        description: `تم تسجيل الدخول بنجاح بصلاحيات المشرف العام (${data.username}).`,
      });

      // Invalidate and refetch auth state before navigating
      await queryClient.invalidateQueries();
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'بيانات الدخول غير صحيحة أو لا تملك صلاحية المشرف.');
      toast({
        title: 'تعذر الدخول',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      dir="rtl"
      style={{
        background: 'radial-gradient(ellipse at center, #0a1f18 0%, #030b08 100%)',
      }}
    >
      <div className="w-full max-w-md space-y-6">
        {/* Top Badge & Title */}
        <div className="text-center space-y-3">
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border border-amber-500/40 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #B88A3B 0%, #8c6422 100%)',
              boxShadow: '0 8px 30px rgba(184, 138, 59, 0.3)',
            }}
          >
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>

          <div>
            <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Admin Portal Gateway
            </span>
            <h1 className="text-2xl font-black text-white mt-2 tracking-tight">
              بوابة دخول المشرف العام
            </h1>
            <p className="text-xs text-muted-foreground mt-1 text-slate-400">
              لوحة التحكم المركزية لإدارة حسابات الموظفين وصلاحيات المنظومة
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-7 shadow-2xl space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 flex items-center gap-3 text-red-300 text-xs font-semibold">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                اسم المشرف (Admin Username)
              </Label>
              <div className="relative">
                <User className="w-4 h-4 absolute start-3 inset-y-0 my-auto text-slate-400" />
                <Input
                  required
                  placeholder="e.g. 5128 أو admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="ps-9 font-mono text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500"
                  dir="ltr"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                كلمة المرور (Master Password)
              </Label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute start-3 inset-y-0 my-auto text-slate-400" />
                <Input
                  required
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ps-9 font-mono text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500"
                  dir="ltr"
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full h-11 text-sm font-bold gap-2 text-white border-0 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #B88A3B 0%, #966c25 100%)',
              }}
            >
              <KeyRound className="w-4 h-4" />
              {loading ? 'جارٍ التحقق من المشرف...' : 'دخول المشرف العام'}
            </Button>
          </form>
        </div>

        {/* Switch to Regular Staff Login */}
        <div className="text-center pt-2">
          <Link href="/login">
            <span className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-amber-400 transition-colors cursor-pointer py-1.5 px-3 rounded-lg hover:bg-white/5">
              <span>الانتقال لبوابة الموظفين ونظام الجلسات</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
