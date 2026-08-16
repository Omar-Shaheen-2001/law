import { Link, useLocation } from 'wouter';
import { LayoutDashboard, MessageSquare, Calendar, Moon, Sun, LogOut, Settings, Scale, FileText, ShieldCheck, Gavel, CheckSquare, Users } from 'lucide-react';
import { useTheme } from './theme-provider';
import { useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { GlobalSearch } from './global-search';

const navigation = [
  { name: 'لوحة التحكم', path: '/', icon: LayoutDashboard },
  { name: 'تحليل رسالة', path: '/chat', icon: MessageSquare },
  { name: 'جميع الجلسات', path: '/sessions', icon: Calendar },
  { name: 'تقارير الجلسات', path: '/reports', icon: FileText },
  { name: 'الوكالات', path: '/poa', icon: ShieldCheck },
  { name: 'الأحكام', path: '/judgments', icon: Gavel },
  { name: 'المهام', path: '/tasks', icon: CheckSquare },
  { name: 'إدارة المستخدمين', path: '/users', icon: Users },
  { name: 'الإعدادات', path: '/settings', icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    onNavigate?.();
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = '/login';
      },
      onError: () => {
        toast({
          title: 'خطأ',
          description: 'فشل تسجيل الخروج',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <div
      className="flex flex-col h-full sidebar-gradient"
      style={{
        background: theme === 'dark'
          ? 'linear-gradient(160deg, #051F17 0%, #093A2A 55%, #03120E 100%)'
          : 'linear-gradient(160deg, #093A2A 0%, #0D4E3A 55%, #06261C 100%)',
        borderInlineStart: theme === 'dark'
          ? '1px solid rgba(255,255,255,0.06)'
          : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Logo/Brand */}
      <div
        className="p-4 space-y-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2.5">
          {/* Icon badge */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: '#B88A3B',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            <Scale className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-white leading-tight truncate">
              إدارة جلسات المحكمة
            </h1>
            <p className="text-[10px] mt-0.5" style={{ color: '#B88A3B' }}>
              بوابة السكرتير القانوني
            </p>
          </div>
        </div>

        {/* Global Search Button */}
        <GlobalSearch />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest px-3 py-2"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          القائمة الرئيسية
        </p>

        {navigation.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => onNavigate?.()}
              data-testid={`nav-${item.path === '/' ? 'dashboard' : item.path.slice(1)}`}
            >
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
                style={
                  isActive
                    ? {
                        background: '#B88A3B',
                        color: '#ffffff',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.25)',
                      }
                    : {
                        color: 'rgba(255,255,255,0.7)',
                      }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.1)';
                    (e.currentTarget as HTMLDivElement).style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = '';
                    (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.7)';
                  }
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.name}</span>
                {isActive && (
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#ffffff' }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer actions */}
      <div
        className="p-3 space-y-1"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          style={{ color: 'rgba(255,255,255,0.65)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
            (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)';
          }}
          data-testid="button-toggle-theme"
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-4 h-4 shrink-0" />
              الوضع الداكن
            </>
          ) : (
            <>
              <Sun className="w-4 h-4 shrink-0" />
              الوضع الفاتح
            </>
          )}
        </button>

        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40"
          style={{ color: 'rgba(255,180,180,0.8)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(252,165,165,1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,180,180,0.8)';
          }}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {logoutMutation.isPending ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
        </button>
      </div>
    </div>
  );
}
