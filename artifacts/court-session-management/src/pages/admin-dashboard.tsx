import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  UserPlus,
  Trash2,
  Key,
  Shield,
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
  Settings,
  Server,
  Activity,
  Bot,
  MessageSquare,
  Sheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  created_at timestamp with time zone default now()
);

-- تفعيل فهرس سريع للبحث
create index if not exists idx_app_users_username on public.app_users (username);
create index if not exists idx_app_users_email on public.app_users (email);`;

export default function AdminDashboardPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const logoutMutation = useLogout();

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

  // Form states
  const [newUser, setNewUser] = useState({
    username: '',
    display_name: '',
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'staff',
  });
  const [newPassword, setNewPassword] = useState('');
  const [editUserData, setEditUserData] = useState({
    display_name: '',
    email: '',
    role: 'staff' as 'admin' | 'staff',
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

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

  useEffect(() => {
    fetchUsers();
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
    toast({ title: 'تم النسخ', description: 'تم نسخ سكربت SQL لإنشاء الجدول في Supabase.' });
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.password.trim()) {
      toast({ title: 'تنبيه', description: 'اسم المستخدم وكلمة المرور مطلوبان.', variant: 'destructive' });
      return;
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

      toast({ title: 'نجاح ✅', description: `تمت إضافة المستخدم (${data.username}) بنجاح.` });
      setIsAddOpen(false);
      setNewUser({
        username: '',
        display_name: '',
        email: '',
        password: '',
        role: 'staff',
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

      toast({ title: 'تم الحفظ ✅', description: 'تم تحديث بيانات المستخدم بنجاح.' });
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
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const staffCount = users.filter((u) => u.role === 'staff').length;

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
                  بوابة الإدارة المركزية
                </h1>
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                  Admin Portal
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                المشرف: <strong className="text-foreground">{currentUser?.username || 'مدير النظام'}</strong>
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

            <Link href="/settings">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>إعدادات النظام</span>
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
            <p className="text-[11px] text-muted-foreground">مستخدم مسجل في النظام</p>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="text-xs font-semibold">المشرفون (Admins)</span>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{adminCount}</p>
            <p className="text-[11px] text-muted-foreground">لديهم كامل صلاحيات الإدارة</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">الموظفون (Staff)</span>
              <User className="w-4 h-4 text-sky-500" />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{staffCount}</p>
            <p className="text-[11px] text-muted-foreground">صلاحية دخول نظام الجلسات فقط</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
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
              {isSupabaseConfigured ? 'المزامنة السحابية نشطة' : 'يرجى ربط Supabase'}
            </p>
          </div>
        </div>

        {/* Supabase Status Alert if not configured */}
        {!isSupabaseConfigured && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Supabase غير مربوط حالياً بلوحة الإدارة
                </h3>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  لتمكين إضافة مستخدمين دائمين وتخزينهم في قاعدة بيانات سحابية آمنة، افتح صفحة الإعدادات وضع بيانات Supabase
                  URL والـ Service Role Key.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-amber-500/20">
              <Link href="/settings">
                <Button size="sm" variant="default" className="text-xs bg-amber-600 hover:bg-amber-700 text-white gap-2">
                  <Database className="w-3.5 h-3.5" />
                  الذهاب لصفحة الإعدادات للربط
                </Button>
              </Link>
              <Button size="sm" variant="outline" onClick={handleCopySql} className="text-xs border-amber-500/40 text-amber-900 dark:text-amber-200 gap-2">
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSql ? 'تم نسخ سكربت SQL' : 'نسخ سكربت الجدول (SQL)'}
              </Button>
            </div>
          </div>
        )}

        {/* User Management Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                إدارة حسابات الموظفين والمستخدمين
              </h2>
              <p className="text-xs text-muted-foreground">
                إضافة حسابات جديدة للموظفين والمحامين للوصول لنظام الجلسات مع إمكانية حذف وتعديل الحسابات
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
                تحديث
              </Button>

              <Button
                onClick={() => setIsAddOpen(true)}
                size="sm"
                disabled={!isSupabaseConfigured}
                className="gap-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              >
                <UserPlus className="w-4 h-4" />
                إضافة مستخدم جديد
              </Button>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 absolute inset-y-0 start-3 my-auto text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو اسم المستخدم أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9 h-9 text-sm"
              />
            </div>
            <div className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
              النتائج: <span className="text-foreground font-bold">{filteredUsers.length}</span>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
                <p className="text-sm">جارٍ تحميل قائمة المستخدمين...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center space-y-3 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold">لا يوجد مستخدمون مسجلون مطابقون للبحث</p>
                {searchQuery && (
                  <Button size="sm" variant="ghost" onClick={() => setSearchQuery('')}>
                    إلغاء التصفية
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground text-xs uppercase font-semibold">
                      <th className="py-3.5 px-4 text-start">المستخدم</th>
                      <th className="py-3.5 px-4 text-start">البريد الإلكتروني</th>
                      <th className="py-3.5 px-4 text-start">الصلاحية / الدور</th>
                      <th className="py-3.5 px-4 text-start">تاريخ التسجيل</th>
                      <th className="py-3.5 px-4 text-center">التحكم والإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map((user) => {
                      const isAdmin = user.role === 'admin';
                      return (
                        <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                          {/* User details */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isAdmin
                                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    : 'bg-primary/20 text-primary border border-primary/30'
                                }`}
                              >
                                {isAdmin ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="font-bold text-foreground text-sm">
                                  {user.display_name || user.username}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                                  @{user.username}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground" dir="ltr">
                            {user.email || '—'}
                          </td>

                          {/* Role Badge */}
                          <td className="py-3.5 px-4">
                            {isAdmin ? (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20 gap-1 text-xs">
                                <ShieldCheck className="w-3 h-3" />
                                مدير نظام (Admin)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs">
                                موظف (Staff)
                              </Badge>
                            )}
                          </td>

                          {/* Created date */}
                          <td className="py-3.5 px-4 text-xs text-muted-foreground">
                            {user.created_at
                              ? new Date(user.created_at).toLocaleDateString('ar-SA', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Change Password */}
                              <Button
                                size="sm"
                                variant="ghost"
                                title="تغيير كلمة المرور"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setNewPassword('');
                                  setIsPasswordModalOpen(true);
                                }}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              >
                                <Key className="w-4 h-4" />
                              </Button>

                              {/* Edit User */}
                              <Button
                                size="sm"
                                variant="ghost"
                                title="تعديل البيانات والصلاحية"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setEditUserData({
                                    display_name: user.display_name || '',
                                    email: user.email || '',
                                    role: user.role,
                                  });
                                  setIsEditModalOpen(true);
                                }}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>

                              {/* Delete User */}
                              <Button
                                size="sm"
                                variant="ghost"
                                title="حذف المستخدم"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="h-8 w-8 p-0 text-red-500/70 hover:text-red-600 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 1. Modal: Add New User */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5" dir="rtl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                إضافة مستخدم / موظف جديد
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">اسم المستخدم (Username) *</Label>
                <div className="relative">
                  <User className="w-4 h-4 absolute start-3 inset-y-0 my-auto text-muted-foreground" />
                  <Input
                    required
                    placeholder="e.g. lawyer_ahmed"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    className="ps-9 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الاسم الظاهر للموظف</Label>
                <Input
                  placeholder="e.g. الأستاذ أحمد المحمد"
                  value={newUser.display_name}
                  onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">البريد الإلكتروني (اختياري)</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute start-3 inset-y-0 my-auto text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="ahmed@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="ps-9 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">كلمة المرور *</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute start-3 inset-y-0 my-auto text-muted-foreground" />
                  <Input
                    required
                    type="password"
                    placeholder="••••••••"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="ps-9 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الدور والصلاحية</Label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'staff' })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="staff">موظف (Staff) — دخول نظام الجلسات فقط</option>
                  <option value="admin">مشرف عام (Admin) — صلاحية كاملة للدخول لبوابة الإدارة وإدارة المستخدمين</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                  disabled={actionLoading}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {actionLoading ? 'جارٍ الإنشاء...' : 'حفظ وإنشاء المستخدم'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Change Password */}
      {isPasswordModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                تغيير كلمة المرور: @{selectedUser.username}
              </h3>
              <button onClick={() => setIsPasswordModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">كلمة المرور الجديدة</Label>
                <Input
                  required
                  type="password"
                  placeholder="أدخل كلمة المرور الجديدة"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono text-sm"
                  dir="ltr"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPasswordModalOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading} className="bg-primary text-primary-foreground">
                  {actionLoading ? 'جارٍ الحفظ...' : 'تحديث كلمة المرور'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Edit User */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                تعديل بيانات المستخدم: @{selectedUser.username}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الاسم الظاهر</Label>
                <Input
                  value={editUserData.display_name}
                  onChange={(e) => setEditUserData({ ...editUserData, display_name: e.target.value })}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={editUserData.email}
                  onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                  className="font-mono text-sm"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الدور والصلاحية</Label>
                <select
                  value={editUserData.role}
                  onChange={(e) => setEditUserData({ ...editUserData, role: e.target.value as 'admin' | 'staff' })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                >
                  <option value="staff">موظف (Staff)</option>
                  <option value="admin">مشرف عام (Admin)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditModalOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading} className="bg-primary text-primary-foreground">
                  {actionLoading ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Delete Confirmation */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-card border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-base font-bold">تأكيد حذف المستخدم</h3>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              هل أنت متأكد من رغبتك في حذف حساب المستخدم{' '}
              <strong className="text-foreground">@{selectedUser.username}</strong> ({selectedUser.display_name || 'بدون اسم'})؟ لن يتمكن من تسجيل الدخول للنظام بعد الآن.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDeleteModalOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDeleteUser}
                disabled={actionLoading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {actionLoading ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
