import { useGetDashboardStats } from '@workspace/api-client-react';
import { Briefcase, Calendar, CheckCircle2, Clock, ArrowLeft, Sparkles, FileKey, Gavel, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';

const stats = [
  {
    key: 'totalCases',
    label: 'إجمالي القضايا',
    icon: Briefcase,
    gradient: 'from-emerald-600/15 to-emerald-700/5',
    iconBg: 'bg-emerald-600/15',
    iconColor: 'text-emerald-700 dark:text-emerald-400',
    borderColor: 'border-emerald-600/20',
    dotColor: 'bg-emerald-600',
    href: '/sessions',
  },
  {
    key: 'todayHearings',
    label: 'جلسات اليوم',
    icon: Calendar,
    gradient: 'from-amber-500/15 to-amber-600/5',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
    borderColor: 'border-amber-500/20',
    dotColor: 'bg-amber-500',
    href: '/sessions',
  },
  {
    key: 'upcomingHearings',
    label: 'جلسات قادمة',
    icon: Clock,
    gradient: 'from-emerald-500/15 to-emerald-600/5',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
    borderColor: 'border-emerald-500/20',
    dotColor: 'bg-emerald-500',
    href: '/sessions',
  },
  {
    key: 'finishedHearings',
    label: 'جلسات منتهية',
    icon: CheckCircle2,
    gradient: 'from-purple-500/15 to-purple-600/5',
    iconBg: 'bg-purple-500/15',
    iconColor: 'text-purple-500',
    borderColor: 'border-purple-500/20',
    dotColor: 'bg-purple-500',
    href: '/sessions',
  },
  {
    key: 'totalPoas',
    label: 'إجمالي الوكالات',
    icon: FileKey,
    gradient: 'from-blue-500/15 to-blue-600/5',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
    borderColor: 'border-blue-500/20',
    dotColor: 'bg-blue-500',
    href: '/poa',
  },
  {
    key: 'favorableJudgments',
    label: 'أحكام نهائية',
    icon: Gavel,
    gradient: 'from-emerald-600/15 to-emerald-700/5',
    iconBg: 'bg-emerald-600/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-600/30',
    dotColor: 'bg-emerald-600',
    href: '/judgments',
  },
  {
    key: 'unfavorableJudgments',
    label: 'أحكام ابتدائية',
    icon: XCircle,
    gradient: 'from-blue-600/15 to-blue-700/5',
    iconBg: 'bg-blue-600/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-600/30',
    dotColor: 'bg-blue-600',
    href: '/judgments',
  },
] as const;

export default function DashboardPage() {
  const { data, isLoading, error } = useGetDashboardStats();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-5 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">فشل تحميل إحصائيات لوحة التحكم</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="fade-in-up">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-6 rounded-full bg-primary" />
          <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
        </div>
        <p className="text-muted-foreground text-sm mr-3">نظرة عامة على نشاط جلسات المحكمة والوكالات والأحكام القضائية</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          const value = (data as Record<string, number> | undefined)?.[stat.key];

          return (
            <Link key={stat.key} href={stat.href}>
              <div
                className={`fade-in-up fade-in-up-delay-${i + 1} rounded-xl border ${stat.borderColor} bg-gradient-to-br ${stat.gradient} p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full flex flex-col justify-between`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                  </div>
                  <div className={`w-2 h-2 rounded-full ${stat.dotColor} mt-1`} />
                </div>
                <div>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 mb-1" />
                  ) : (
                    <div className="text-4xl font-bold font-mono tracking-tight" data-testid={`stat-${stat.key}`}>
                      {value ?? 0}
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-1 font-medium">{stat.label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="fade-in-up fade-in-up-delay-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Link href="/chat">
          <div
            className="group relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 to-primary/3 p-6 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 h-full"
            data-testid="link-analyze-message"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base mb-1">تحليل رسالة جديدة</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  استخراج تفاصيل الجلسة من الرسالة النصية
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowLeft className="w-4 h-4 text-primary" />
            </div>
          </div>
        </Link>

        <Link href="/sessions">
          <div
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 cursor-pointer transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 h-full"
            data-testid="link-view-sessions"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <Calendar className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base mb-1">عرض جميع الجلسات</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  تصفّح وإدارة جلسات الاستماع
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Link>

        <Link href="/poa">
          <div
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 cursor-pointer transition-all duration-200 hover:border-blue-500/30 hover:shadow-lg hover:-translate-y-0.5 h-full"
            data-testid="link-view-poa"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                <FileKey className="w-6 h-6 text-blue-500 transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base mb-1">إدارة الوكالات الشرعية</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  متابعة الوكالات وتواريخ الانتهاء
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Link>

        <Link href="/judgments">
          <div
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 cursor-pointer transition-all duration-200 hover:border-emerald-500/30 hover:shadow-lg hover:-translate-y-0.5 h-full"
            data-testid="link-view-judgments"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                <Gavel className="w-6 h-6 text-emerald-500 transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base mb-1">سجل الأحكام القضائية</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  متابعة القرارات والأحكام النهائية
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

