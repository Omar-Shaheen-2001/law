import React, { useState, useEffect } from 'react';
import {
  Users as UsersIcon,
  UserPlus,
  Trash2,
  Key,
  Shield,
  ShieldCheck,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

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

export default function UsersPage() {
  const { toast } = useToast();
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
      if (res.status === 401) {
        throw new Error('يرجى تسجيل الدخول أولاً للوصول إلى إدارة المستخدمين.');
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

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-in-up">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-6 rounded-full bg-primary" />
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <UsersIcon className="w-6 h-6 text-primary" />
              إدارة المستخدمين والصلاحيات
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mr-3">
            إضافة وإدارة حسابات موظفي المكتب القانوني والتحكم بصلاحيات الدخول عبر Supabase
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

      {/* Supabase Status Banner */}
      {!isSupabaseConfigured ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3 fade-in-up">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                قاعدة بيانات Supabase غير مربوطة حالياً
              </h3>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                يعمل النظام حالياً ببيانات الدخول الافتراضية. لإضافة وحذف وإدارة مستخدمين متعددين، يرجى إدخال رابط الـ
                Supabase ومفتاح الـ Service Key في صفحة الإعدادات وتأكيد إنشاء جدول المستخدمين.
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
              {copiedSql ? 'تم نسخ سكربت SQL' : 'نسخ سكربت إنشاء الجدول (SQL)'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center justify-between fade-in-up">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              Supabase متصل ويعمل بنجاح — تتم إدارة وتخزين المستخدمين سحابياً ومزامنتها فورياً.
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopySql}
            className="text-[11px] h-7 gap-1.5 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
          >
            {copiedSql ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copiedSql ? 'تم النسخ' : 'سكربت الـ SQL'}
          </Button>
        </div>
      )}

      {/* Search and Users Count */}
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
          إجمالي المستخدمين: <span className="text-foreground font-bold">{users.length}</span>
        </div>
      </div>

      {/* Users Table Card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm fade-in-up">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
            <p className="text-sm">جارٍ تحميل قائمة المستخدمين...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center space-y-3 text-muted-foreground">
            <UsersIcon className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-semibold">لا يوجد مستخدمون مطابقون للبحث</p>
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
                  <th className="py-3.5 px-4 text-start">الدور / الصلاحية</th>
                  <th className="py-3.5 px-4 text-start">تاريخ التسجيل</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
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

      {/* 1. Modal: Add New User */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5"
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                إضافة مستخدم جديد
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
                    placeholder="e.g. ahmed_law"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    className="ps-9 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الاسم الظاهر (Display Name)</Label>
                <Input
                  placeholder="e.g. أحمد المحمد"
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
                  <option value="staff">موظف (Staff) — إدارة الجلسات والتحليل</option>
                  <option value="admin">مدير نظام (Admin) — كامل الصلاحيات بما فيها إدارة المستخدمين</option>
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
                  {actionLoading ? 'جارٍ الإنشاء...' : 'حفظ المستخدم'}
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
                تغيير كلمة المرور: {selectedUser.username}
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
                  <option value="admin">مدير نظام (Admin)</option>
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
              <strong className="text-foreground">@{selectedUser.username}</strong> ({selectedUser.display_name || 'بدون اسم'})؟ لن يتمكن من تسجيل الدخول بعد الآن.
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
