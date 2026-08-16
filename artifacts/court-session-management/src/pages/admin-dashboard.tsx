import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  UserPlus,
  Trash2,
  Key,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Database,
  Copy,
  Check,
  User,
  Mail,
  Lock,
  Edit2,
  LogOut,
  ExternalLink,
  Save,
  Eye,
  EyeOff,
  Sheet,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Link, useLocation } from 'wouter';
import { useGetCurrentUser, useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export interface AppUser {
  id: string;
  username: string;
  email?: string | null;
  role: 'admin' | 'staff';
  display_name?: string | null;
  google_service_account_json?: string | null;
  google_spreadsheet_id?: string | null;
  google_sheet_name?: string | null;
  has_google_service?: boolean;
  created_at?: string;
}

interface UsersApiResponse {
  isSupabaseConfigured: boolean;
  users: AppUser[];
  error?: string;
}

const SUPABASE_SQL_SCRIPT = `-- أنشئ جدول المستخدمين في Supabase عبر SQL Editor:
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  email text,
  password_hash text not null,
  role text default 'staff', -- 'admin' | 'staff'
  display_name text,
  google_service_account_json text, -- ملف مفتاح Google Service Account JSON الخاص بالمستخدم
  google_spreadsheet_id text,       -- معرف جدول Google Sheets الخاص بالمستخدم
  google_sheet_name text default 'Sessions',
  created_at timestamp with time zone default now()
);

-- تفعيل فهرس سريع للبحث
create index if not exists idx_app_users_username on public.app_users (username);
create index if not exists idx_app_users_email on public.app_users (email);

-- إذا كان الجدول موجوداً مسبقاً في مشروعك، نفّذ هذه الأوامر لإضافة الأعمدة الجديدة:
alter table public.app_users add column if not exists google_service_account_json text;
alter table public.app_users add column if not exists google_spreadsheet_id text;
alter table public.app_users add column if not exists google_sheet_name text default 'Sessions';`;

export default function AdminDashboardPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const logoutMutation = useLogout();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'users' | 'supabase'>('users');

  // Loading states
  const [loading, setLoading] = useState(true);
  const [isSupabaseConfigured, setIsSupabaseConfigured] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  // Form states for Users
  const [newUser, setNewUser] = useState({
    username: '',
    display_name: '',
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'staff',
    google_service_account_json: '',
    google_spreadsheet_id: '',
    google_sheet_name: '',
  });

  const [newPassword, setNewPassword] = useState('');

  const [editUserData, setEditUserData] = useState({
    display_name: '',
    email: '',
    role: 'staff' as 'admin' | 'staff',
    google_service_account_json: '',
    google_spreadsheet_id: '',
    google_sheet_name: '',
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Supabase Settings form state
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [supabaseTableName, setSupabaseTableName] = useState('app_users');
  const [supabaseKeyIsSet, setSupabaseKeyIsSet] = useState(false);
  const [maskedSupabaseKey, setMaskedSupabaseKey] = useState('');
  const [showSupabaseKey, setShowSupabaseKey] = useState(false);
  const [savingSupabase, setSavingSupabase] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        throw new Error('غير مصرح لك بالوصول إلى لوحة الإدارة.');
      }
      const data: UsersApiResponse = await res.json();
      setIsSupabaseConfigured(data.isSupabaseConfigured);
      setUsers(data.users || []);
    } catch (err: any) {
      toast({
        title: 'خطأ',
        description: err.message || 'فشل جلب قائمة المستخدمين',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSupabaseSettings = async () => {
    try {
      const res = await fetch('/api/settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSupabaseUrl(data.supabaseUrl || '');
        setSupabaseTableName(data.supabaseTableName || 'app_users');
        setSupabaseKeyIsSet(data.supabaseKeyIsSet);
        setMaskedSupabaseKey(data.supabaseKey || '');
      }
    } catch {
      // Ignore if fetch settings fails
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSupabaseSettings();
  }, []);

  const handleAdminLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        navigate('/admin/login', { replace: true });
      },
      onError: () => {
        toast({ title: 'خطأ', description: 'فشل تسجيل الخروج', variant: 'destructive' });
      },
    });
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopiedSql(true);
    toast({ title: 'تم النسخ ✅', description: 'تم نسخ سكربت SQL لإنشاء وتحديث الجدول في Supabase.' });
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleSaveSupabaseSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSupabase(true);
    try {
      const payload: Record<string, string> = {
        supabaseUrl: supabaseUrl.trim(),
        supabaseTableName: supabaseTableName.trim() || 'app_users',
      };
      if (supabaseKey.trim()) {
        payload.supabaseKey = supabaseKey.trim();
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشل حفظ إعدادات Supabase');
      }

      const updated = await res.json();
      setSupabaseKeyIsSet(updated.supabaseKeyIsSet);
      setMaskedSupabaseKey(updated.supabaseKey || '');
      setSupabaseKey('');

      toast({
        title: 'تم الحفظ بنجاح ✅',
        description: 'تم تحديث بيانات الاتصال بـ Supabase.',
      });

      // Refresh users list and settings status
      await fetchUsers();
      await fetchSupabaseSettings();
    } catch (err: any) {
      toast({
        title: 'خطأ في الحفظ',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSavingSupabase(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.password.trim()) {
      toast({ title: 'تنبيه', description: 'اسم المستخدم وكلمة المرور مطلوبان.', variant: 'destructive' });
      return;
    }

    // Optional JSON validation on client
    if (newUser.google_service_account_json.trim()) {
      try {
        const parsed = JSON.parse(newUser.google_service_account_json.trim());
        if (!parsed.client_email || !parsed.private_key) {
          toast({
            title: 'خطأ في ملف Google JSON',
            description: 'الملف يجب أن يحتوي على client_email و private_key.',
            variant: 'destructive',
          });
          return;
        }
      } catch {
        toast({
          title: 'صيغة JSON غير صحيحة',
          description: 'تأكد من نسخ كود Google Service Account JSON بشكل سليم.',
          variant: 'destructive',
        });
        return;
      }
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newUser),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل إنشاء المستخدم');
      }

      toast({ title: 'نجاح ✅', description: `تمت إضافة المستخدم (${data.username}) وتخصيص بياناته بنجاح.` });
      setIsAddOpen(false);
      setNewUser({
        username: '',
        display_name: '',
        email: '',
        password: '',
        role: 'staff',
        google_service_account_json: '',
        google_spreadsheet_id: '',
        google_sheet_name: '',
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'فشل العملية', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword.trim()) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تحديث كلمة المرور');
      }

      toast({ title: 'تم التحديث ✅', description: `تم تغيير كلمة المرور للمستخدم (${selectedUser.username}) بنجاح.` });
      setIsPasswordModalOpen(false);
      setNewPassword('');
      setSelectedUser(null);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    // Optional JSON validation on client
    if (editUserData.google_service_account_json.trim()) {
      try {
        const parsed = JSON.parse(editUserData.google_service_account_json.trim());
        if (!parsed.client_email || !parsed.private_key) {
          toast({
            title: 'خطأ في ملف Google JSON',
            description: 'الملف يجب أن يحتوي على client_email و private_key.',
            variant: 'destructive',
          });
          return;
        }
      } catch {
        toast({
          title: 'صيغة JSON غير صحيحة',
          description: 'تأكد من نسخ كود Google Service Account JSON بشكل سليم.',
          variant: 'destructive',
        });
        return;
      }
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editUserData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تعديل بيانات المستخدم');
      }

      toast({ title: 'تم الحفظ ✅', description: 'تم تحديث بيانات المستخدم وتخصيص حسابه بنجاح.' });
      setIsEditModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'فشل حذف المستخدم');
      }

      toast({ title: 'تم الحذف', description: `تم حذف المستخدم (${selectedUser.username}) بنجاح.` });
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      (u.display_name && u.display_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.google_spreadsheet_id && u.google_spreadsheet_id.toLowerCase().includes(q))
    );
  });

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const staffCount = users.filter((u) => u.role === 'staff').length;
  const customSheetsCount = users.filter((u) => u.has_google_service).length;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* Top Navigation Bar for Admin Portal */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ background: 'linear-gradient(135deg, #B88A3B 0%, #8c6422 100%)' }}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base tracking-tight text-foreground">
                  بوابة المشرف العام
                </h1>
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                  Admin Gateway
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                المشرف: <strong className="text-foreground">{currentUser?.username || '407171248'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs border-primary/30 text-primary hover:bg-primary/10"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>دخول نظام الجلسات</span>
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleAdminLogout}
              disabled={logoutMutation.isPending}
              className="gap-2 text-xs text-red-500/80 hover:text-red-600 hover:bg-red-500/10"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">إجمالي الحسابات</span>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{users.length}</p>
            <p className="text-[11px] text-muted-foreground">مستخدم مسجل في المنظومة</p>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="text-xs font-semibold">المشرفون (Admins)</span>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{adminCount}</p>
            <p className="text-[11px] text-muted-foreground">صلاحيات إدارة كاملة</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              <span className="text-xs font-semibold">شيتات مخصصة (Custom)</span>
              <Sheet className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{customSheetsCount}</p>
            <p className="text-[11px] text-muted-foreground">مستخدمون بقواعد بيانات مستقلة</p>
          </div>

          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-sky-600 dark:text-sky-400">
              <span className="text-xs font-semibold">قاعدة Supabase</span>
              <Database className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="text-sm font-bold text-foreground">
                {isSupabaseConfigured ? 'متصلة وسحابية' : 'الوضع الافتراضي'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isSupabaseConfigured ? 'المزامنة السحابية نشطة' : 'يمكنك ضبط Supabase أدناه'}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-border pb-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'users'
                ? 'border-amber-500 text-amber-500 bg-amber-500/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>إدارة حسابات المستخدمين والموظفين</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {users.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab('supabase')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'supabase'
                ? 'border-sky-500 text-sky-500 bg-sky-500/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>إعدادات قاعدة بيانات المستخدمين (Supabase)</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </button>
        </div>

        {/* Tab 1: User Management */}
        {activeTab === 'users' && (
          <div className="space-y-4 fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  قائمة المستخدمين والموظفين المصرح لهم
                </h2>
                <p className="text-xs text-muted-foreground">
                  إضافة حسابات مخصصة، ربط Google Service Account وشيت مستقل لكل مستخدم، وتعديل الصلاحيات
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchUsers}
                  disabled={loading}
                  className="gap-2 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>تحديث</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => setIsAddOpen(true)}
                  className="gap-2 text-xs text-white"
                  style={{ background: 'linear-gradient(135deg, #B88A3B 0%, #966c25 100%)' }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>إضافة مستخدم جديد</span>
                </Button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative max-w-md">
              <Search className="w-4 h-4 absolute start-3 inset-y-0 my-auto text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو البريد أو اسم المستخدم أو معرف الشيت..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9 text-sm h-9"
              />
            </div>

            {/* Users Table */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs sm:text-sm">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-3 px-4 text-start">المستخدم</th>
                      <th className="py-3 px-4 text-start">الاسم الظاهر</th>
                      <th className="py-3 px-4 text-start">البريد الإلكتروني</th>
                      <th className="py-3 px-4 text-start">الصلاحية</th>
                      <th className="py-3 px-4 text-start">قاعدة Google Sheets</th>
                      <th className="py-3 px-4 text-start">تاريخ الإنشاء</th>
                      <th className="py-3 px-4 text-end">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                            <span className="text-xs">جارٍ جلب الحسابات...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <Users className="w-8 h-8 opacity-30" />
                            <p className="text-sm font-medium">لا توجد حسابات مطابقة</p>
                            <p className="text-xs">يمكنك إضافة مستخدم جديد بالضغط على زر الإضافة أعلاه.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isCurrent = currentUser?.username === u.username;
                        return (
                          <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-foreground">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-sans font-bold text-xs shrink-0">
                                  {u.username.slice(0, 2).toUpperCase()}
                                </div>
                                <span>{u.username}</span>
                                {isCurrent && (
                                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                                    حسابك الحالي
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {u.display_name || '—'}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                              {u.email || '—'}
                            </td>
                            <td className="py-3 px-4">
                              {u.role === 'admin' ? (
                                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-xs">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>مشرف (Admin)</span>
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1 text-xs">
                                  <User className="w-3 h-3 text-sky-500" />
                                  <span>موظف (Staff)</span>
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {u.has_google_service ? (
                                <div className="space-y-0.5">
                                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]">
                                    <Sparkles className="w-3 h-3" />
                                    <span>شيت مخصص</span>
                                  </Badge>
                                  {u.google_spreadsheet_id && (
                                    <p className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={u.google_spreadsheet_id}>
                                      ID: {u.google_spreadsheet_id.slice(0, 8)}...
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span>الشيت العام للمنظومة</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs">
                              {u.created_at
                                ? new Date(u.created_at).toLocaleDateString('ar-SA', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </td>
                            <td className="py-3 px-4 text-end">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="تغيير كلمة المرور"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setIsPasswordModalOpen(true);
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                                >
                                  <Key className="w-4 h-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="تعديل المستخدم وتخصيص Google Sheets"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setEditUserData({
                                      display_name: u.display_name || '',
                                      email: u.email || '',
                                      role: u.role,
                                      google_service_account_json: '',
                                      google_spreadsheet_id: u.google_spreadsheet_id || '',
                                      google_sheet_name: u.google_sheet_name || '',
                                    });
                                    setIsEditModalOpen(true);
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="حذف المستخدم"
                                  disabled={isCurrent}
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setIsDeleteModalOpen(true);
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Supabase Database Configuration */}
        {activeTab === 'supabase' && (
          <div className="space-y-6 fade-in-up">
            {/* Supabase Settings Card */}
            <div className="rounded-2xl border border-sky-500/30 bg-card overflow-hidden shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-5 border-b border-border bg-sky-500/10 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center">
                    <Database className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-sky-950 dark:text-sky-100">
                      إعدادات وربط قاعدة بيانات المستخدمين (Supabase)
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      ربط الحسابات السحابية لحفظ وإدارة مستخدمي وموظفي المنظومة وتخصيص بياناتهم
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopySql}
                  className="gap-2 text-xs border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 self-start sm:self-auto"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'تم نسخ سكربت SQL' : 'نسخ سكربت الجدول (SQL)'}
                </Button>
              </div>

              <form onSubmit={handleSaveSupabaseSettings} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    رابط مشروع Supabase (Project URL)
                  </Label>
                  <Input
                    placeholder="https://xyzprojectid.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="font-mono text-sm h-10"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    الرابط الخاص بمشروع Supabase من لوحة التحكم: Settings ← API.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    مفتاح الخدمة السحابية (Supabase Service Role Key / Secret)
                    {supabaseKeyIsSet && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold normal-case tracking-normal text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        ✔ محدَّد
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showSupabaseKey ? 'text' : 'password'}
                      placeholder={
                        supabaseKeyIsSet
                          ? `القيمة الحالية: ${maskedSupabaseKey} — اتركه فارغاً للإبقاء عليها`
                          : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                      }
                      value={supabaseKey}
                      onChange={(e) => setSupabaseKey(e.target.value)}
                      className="font-mono text-sm h-10 pe-10"
                      dir="ltr"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 end-0 px-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowSupabaseKey((v) => !v)}
                      tabIndex={-1}
                    >
                      {showSupabaseKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    مفتاح Service Role Key لإدارة المستخدمين والتسجيل الآمن (Project Settings ← API).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    اسم جدول المستخدمين (Table Name)
                  </Label>
                  <Input
                    placeholder="app_users"
                    value={supabaseTableName}
                    onChange={(e) => setSupabaseTableName(e.target.value)}
                    className="font-mono text-sm h-10"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    الاسم الافتراضي: <code>app_users</code>
                  </p>
                </div>

                {/* SQL Script Box */}
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-bold flex items-center justify-between text-muted-foreground">
                    <span>سكربت إنشاء وتحديث الجدول في Supabase (SQL Script):</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      انسخ والصق في SQL Editor داخل Supabase
                    </span>
                  </Label>
                  <div className="rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs overflow-x-auto relative">
                    <pre className="text-slate-800 dark:text-slate-200" dir="ltr">
                      {SUPABASE_SQL_SCRIPT}
                    </pre>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    type="submit"
                    disabled={savingSupabase}
                    className="gap-2 px-6 h-10 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md"
                  >
                    <Save className="w-4 h-4" />
                    {savingSupabase ? 'جارٍ الحفظ والتحقق...' : 'حفظ إعدادات Supabase'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Add User with Google Sheets & Service Account Customization */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                <span>إضافة مستخدم جديد وتخصيص حسابه</span>
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold px-2 py-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 max-h-[75vh] overflow-y-auto pe-1">
              {/* Account Basic Info */}
              <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/20">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">اسم المستخدم (Username) *</Label>
                  <Input
                    required
                    placeholder="e.g. lawyer1 أو 5128"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">الاسم الظاهر</Label>
                  <Input
                    placeholder="e.g. أ. عمر شاهين"
                    value={newUser.display_name}
                    onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
                    className="text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">البريد الإلكتروني (اختياري)</Label>
                  <Input
                    type="email"
                    placeholder="lawyer@office.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">كلمة المرور *</Label>
                  <Input
                    required
                    type="password"
                    placeholder="••••••••"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">الصلاحية (Role)</Label>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, role: 'staff' })}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        newUser.role === 'staff'
                          ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>موظف (Staff)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, role: 'admin' })}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        newUser.role === 'admin'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>مشرف (Admin)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Per-User Google Sheets & Service Account Customization */}
              <div className="space-y-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                  <Sheet className="w-4 h-4" />
                  <span>تخصيص Google Sheets و Service Account لهذا المستخدم (اختياري)</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  إذا أردت أن يعمل هذا المستخدم على جدول Google Sheets خاص به وبحساب Google Cloud منفصل تماماً، الصق مفتاح الـ JSON الخاص به ومعرّف جدوله أدناه:
                </p>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold flex items-center justify-between">
                    <span>محتوى ملف Google Service Account JSON:</span>
                    <span className="text-[10px] text-muted-foreground font-mono">client_email + private_key</span>
                  </Label>
                  <Textarea
                    placeholder={`{\n  "type": "service_account",\n  "client_email": "user-account@project.iam.gserviceaccount.com",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n..."\n}`}
                    value={newUser.google_service_account_json}
                    onChange={(e) => setNewUser({ ...newUser, google_service_account_json: e.target.value })}
                    className="font-mono text-xs h-24"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">معرّف جدول جوجل شيت (Spreadsheet ID) الخاص به</Label>
                  <Input
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    value={newUser.google_spreadsheet_id}
                    onChange={(e) => setNewUser({ ...newUser, google_spreadsheet_id: e.target.value })}
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    تأكد من مشاركة الجدول مع الإيميل الموجود في ملف الـ Service Account بصلاحية محرر (Editor).
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">اسم ورقة العمل (Sheet Name) (اختياري)</Label>
                  <Input
                    placeholder="Sessions"
                    value={newUser.google_sheet_name}
                    onChange={(e) => setNewUser({ ...newUser, google_sheet_name: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                  className="text-xs"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="text-xs text-white"
                  style={{ background: 'linear-gradient(135deg, #B88A3B 0%, #966c25 100%)' }}
                >
                  {actionLoading ? 'جارٍ الحفظ...' : 'حفظ وإضافة المستخدم'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change Password */}
      {isPasswordModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" />
                <span>تغيير كلمة المرور للمستخدم ({selectedUser.username})</span>
              </h3>
              <button
                onClick={() => {
                  setIsPasswordModalOpen(false);
                  setSelectedUser(null);
                }}
                className="text-muted-foreground hover:text-foreground text-sm font-bold px-2 py-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-3.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">كلمة المرور الجديدة *</Label>
                <Input
                  required
                  type="password"
                  placeholder="أدخل كلمة المرور الجديدة..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono text-sm"
                  dir="ltr"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setSelectedUser(null);
                  }}
                  className="text-xs"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="text-xs text-white bg-amber-600 hover:bg-amber-700"
                >
                  {actionLoading ? 'جارٍ التحديث...' : 'تحديث كلمة المرور'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User and Customize Google Sheets */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                <span>تعديل بيانات المستخدم ({selectedUser.username})</span>
              </h3>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedUser(null);
                }}
                className="text-muted-foreground hover:text-foreground text-sm font-bold px-2 py-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4 max-h-[75vh] overflow-y-auto pe-1">
              <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/20">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">الاسم الظاهر</Label>
                  <Input
                    placeholder="e.g. أ. عمر شاهين"
                    value={editUserData.display_name}
                    onChange={(e) => setEditUserData({ ...editUserData, display_name: e.target.value })}
                    className="text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    placeholder="lawyer@office.com"
                    value={editUserData.email}
                    onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">الصلاحية (Role)</Label>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditUserData({ ...editUserData, role: 'staff' })}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        editUserData.role === 'staff'
                          ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>موظف (Staff)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditUserData({ ...editUserData, role: 'admin' })}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        editUserData.role === 'admin'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>مشرف (Admin)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Per-User Google Sheets Customization in Edit */}
              <div className="space-y-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                    <Sheet className="w-4 h-4" />
                    <span>تخصيص Google Sheets و Service Account</span>
                  </div>
                  {selectedUser.has_google_service && (
                    <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                      ✔ تم التعيين مسبقاً
                    </Badge>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">محتوى ملف Google Service Account JSON الجديد (اختياري)</Label>
                  <Textarea
                    placeholder={selectedUser.has_google_service ? "اتركه فارغاً للإبقاء على الملف الحالي، أو الصق مفتاحاً جديداً..." : "الصق كود Google Service Account JSON هنا..."}
                    value={editUserData.google_service_account_json}
                    onChange={(e) => setEditUserData({ ...editUserData, google_service_account_json: e.target.value })}
                    className="font-mono text-xs h-24"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">معرّف جدول جوجل شيت (Spreadsheet ID)</Label>
                  <Input
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    value={editUserData.google_spreadsheet_id}
                    onChange={(e) => setEditUserData({ ...editUserData, google_spreadsheet_id: e.target.value })}
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">اسم ورقة العمل (Sheet Name)</Label>
                  <Input
                    placeholder="Sessions"
                    value={editUserData.google_sheet_name}
                    onChange={(e) => setEditUserData({ ...editUserData, google_sheet_name: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedUser(null);
                  }}
                  className="text-xs"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="text-xs text-white bg-primary hover:bg-primary/90"
                >
                  {actionLoading ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-500">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">تأكيد حذف المستخدم</h3>
                <p className="text-xs text-muted-foreground">هذا الإجراء نهائي ولا يمكن التراجع عنه.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl">
              هل أنت متأكد من رغبتك في حذف حساب المستخدم <strong className="text-foreground">({selectedUser.username})</strong>؟
              لن يتمكن من الدخول للنظام بعد الحذف.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSelectedUser(null);
                }}
                className="text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={actionLoading}
                onClick={handleDeleteUser}
                className="text-xs bg-red-600 hover:bg-red-700 text-white"
              >
                {actionLoading ? 'جارٍ الحذف...' : 'نعم، احذف الحساب'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
