import { useState, useEffect } from 'react';
import {
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  Settings2,
  Bot,
  Sheet,
  MessageSquare,
  Send,
  Database,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface SettingsData {
  aiApiKey: string;
  aiApiKeyIsSet: boolean;
  aiModel: string;
  aiBaseUrl: string;
  googleSpreadsheetId: string;
  googleSheetName: string;
  hfApiToken: string;
  hfApiTokenIsSet: boolean;
  hfModel: string;
  whatsappNumber: string;
  whatsappApiUrl: string;
  whatsappToken: string;
  whatsappTokenIsSet: boolean;
  whatsappInstanceId: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseKeyIsSet: boolean;
  supabaseTableName: string;
}

interface SettingsFormState {
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  googleSpreadsheetId: string;
  googleSheetName: string;
  hfApiToken: string;
  hfModel: string;
  whatsappNumber: string;
  whatsappApiUrl: string;
  whatsappToken: string;
  whatsappInstanceId: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseTableName: string;
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

async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch('/api/settings', { credentials: 'include' });
  if (res.status === 401) {
    throw new Error('يرجى تسجيل الدخول أولاً لتصفح الإعدادات');
  }
  if (!res.ok) {
    throw new Error(`فشل تحميل الإعدادات (${res.status})`);
  }
  return res.json() as Promise<SettingsData>;
}

async function updateSettings(body: Partial<SettingsFormState>): Promise<SettingsData> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'فشل حفظ الإعدادات');
  }
  return res.json() as Promise<SettingsData>;
}

async function triggerTestWhatsapp(): Promise<{ message: string }> {
  const res = await fetch('/api/settings/test-whatsapp', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'فشل إجراء تجربة الواتساب');
  }
  return res.json() as Promise<{ message: string }>;
}

function SettingField({
  id,
  label,
  description,
  placeholder,
  value,
  onChange,
  type = 'text',
  mono = false,
  dir = 'ltr',
  testId,
  rightContent,
}: {
  id: string;
  label: string;
  description?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
  dir?: 'ltr' | 'rtl' | 'auto';
  testId?: string;
  rightContent?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${mono ? 'font-mono' : ''} h-9 text-sm ${rightContent ? 'pe-10' : ''}`}
          dir={dir}
          data-testid={testId}
          autoComplete="off"
        />
        {rightContent && (
          <div className="absolute inset-y-0 end-0 px-3 flex items-center">
            {rightContent}
          </div>
        )}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenIsSet, setTokenIsSet] = useState(false);
  
  const [showHfToken, setShowHfToken] = useState(false);
  const [hfTokenIsSet, setHfTokenIsSet] = useState(false);

  const [showWaToken, setShowWaToken] = useState(false);
  const [waTokenIsSet, setWaTokenIsSet] = useState(false);

  const [showSupabaseKey, setShowSupabaseKey] = useState(false);
  const [supabaseKeyIsSet, setSupabaseKeyIsSet] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const [form, setForm] = useState<SettingsFormState>({
    aiApiKey: '',
    aiModel: '',
    aiBaseUrl: '',
    googleSpreadsheetId: '',
    googleSheetName: '',
    hfApiToken: '',
    hfModel: '',
    whatsappNumber: '',
    whatsappApiUrl: '',
    whatsappToken: '',
    whatsappInstanceId: '',
    supabaseUrl: '',
    supabaseKey: '',
    supabaseTableName: '',
  });

  const [maskedToken, setMaskedToken] = useState('');
  const [maskedHfToken, setMaskedHfToken] = useState('');
  const [maskedWaToken, setMaskedWaToken] = useState('');
  const [maskedSupabaseKey, setMaskedSupabaseKey] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchSettings()
      .then((data) => {
        setTokenIsSet(data.aiApiKeyIsSet);
        setMaskedToken(data.aiApiKey);
        setHfTokenIsSet(data.hfApiTokenIsSet);
        setMaskedHfToken(data.hfApiToken);
        setWaTokenIsSet(data.whatsappTokenIsSet);
        setMaskedWaToken(data.whatsappToken);
        setSupabaseKeyIsSet(data.supabaseKeyIsSet);
        setMaskedSupabaseKey(data.supabaseKey);

        setForm({
          aiApiKey: '',
          aiModel: data.aiModel,
          aiBaseUrl: data.aiBaseUrl,
          googleSpreadsheetId: data.googleSpreadsheetId,
          googleSheetName: data.googleSheetName,
          hfApiToken: '',
          hfModel: data.hfModel,
          whatsappNumber: data.whatsappNumber,
          whatsappApiUrl: data.whatsappApiUrl,
          whatsappToken: '',
          whatsappInstanceId: data.whatsappInstanceId,
          supabaseUrl: data.supabaseUrl,
          supabaseKey: '',
          supabaseTableName: data.supabaseTableName || 'app_users',
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'فشل تحميل الإعدادات';
        toast({ title: 'خطأ', description: msg, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopiedSql(true);
    toast({ title: 'تم النسخ', description: 'تم نسخ سكربت SQL لإنشاء الجدول في Supabase.' });
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<SettingsFormState> = {
        aiModel: form.aiModel,
        aiBaseUrl: form.aiBaseUrl,
        googleSpreadsheetId: form.googleSpreadsheetId,
        googleSheetName: form.googleSheetName,
        hfModel: form.hfModel,
        whatsappNumber: form.whatsappNumber,
        whatsappApiUrl: form.whatsappApiUrl,
        whatsappInstanceId: form.whatsappInstanceId,
        supabaseUrl: form.supabaseUrl,
        supabaseTableName: form.supabaseTableName,
      };
      if (form.aiApiKey.trim()) {
        payload.aiApiKey = form.aiApiKey.trim();
      }
      if (form.hfApiToken.trim()) {
        payload.hfApiToken = form.hfApiToken.trim();
      }
      if (form.whatsappToken.trim()) {
        payload.whatsappToken = form.whatsappToken.trim();
      }
      if (form.supabaseKey.trim()) {
        payload.supabaseKey = form.supabaseKey.trim();
      }

      const updated = await updateSettings(payload);
      setTokenIsSet(updated.aiApiKeyIsSet);
      setMaskedToken(updated.aiApiKey);
      setHfTokenIsSet(updated.hfApiTokenIsSet);
      setMaskedHfToken(updated.hfApiToken);
      setWaTokenIsSet(updated.whatsappTokenIsSet);
      setMaskedWaToken(updated.whatsappToken);
      setSupabaseKeyIsSet(updated.supabaseKeyIsSet);
      setMaskedSupabaseKey(updated.supabaseKey);

      setForm((prev) => ({
        ...prev,
        aiApiKey: '',
        hfApiToken: '',
        whatsappToken: '',
        supabaseKey: '',
      }));
      setSavedAt(new Date());
      toast({ title: 'تم الحفظ ✅', description: 'تم حفظ الإعدادات بنجاح.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      toast({ title: 'فشل الحفظ', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestWhatsapp = async () => {
    setTestingWhatsapp(true);
    try {
      const result = await triggerTestWhatsapp();
      toast({ title: 'تم التنبيه 📲', description: result.message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إرسال التنبيه التجريبي';
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
    } finally {
      setTestingWhatsapp(false);
    }
  };

  const field = (key: keyof SettingsFormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-muted mx-auto flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm">جارٍ تحميل الإعدادات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="fade-in-up">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-6 rounded-full bg-primary" />
          <h1 className="text-2xl font-bold tracking-tight">إعدادات المنصة</h1>
        </div>
        <p className="text-muted-foreground text-sm mr-3">
          تحكّم في إعدادات تذكير الواتساب، قاعدة بيانات المستخدمين Supabase، مفاتيح الذكاء الاصطناعي، والربط مع Google Sheets
        </p>
      </div>

      {/* Saved Alert */}
      {savedAt && (
        <div className="fade-in-up rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            آخر حفظ: {savedAt.toLocaleTimeString('ar-SA')}
          </p>
        </div>
      )}

      {/* Supabase Users Database Settings Card */}
      <div className="fade-in-up rounded-xl border border-sky-500/30 bg-card overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-sky-500/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
              <Database className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">
                إعدادات قاعدة بيانات المستخدمين (Supabase)
              </p>
              <p className="text-xs text-muted-foreground">
                ربط حسابات موظفي المكتب السحابية للتحكم بالمستخدمين وإدارتهم
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopySql}
            className="gap-2 text-xs border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSql ? 'تم نسخ سكربت SQL' : 'نسخ سكربت الجدول'}
          </Button>
        </div>

        <div className="p-5 space-y-4">
          <SettingField
            id="supabaseUrl"
            label="رابط المشروع (Supabase Project URL)"
            placeholder="https://xyzprojectid.supabase.co"
            value={form.supabaseUrl}
            onChange={(v) => field('supabaseUrl', v)}
            mono
            dir="ltr"
            description="الرابط الخاص بمشروع Supabase من Settings ← API"
          />

          <div className="space-y-1.5">
            <Label htmlFor="supabaseKey" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              مفتاح الخدمة السحابية (Supabase Service Role Key / Secret)
              {supabaseKeyIsSet && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold normal-case tracking-normal text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ✔ محدَّد
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="supabaseKey"
                type={showSupabaseKey ? 'text' : 'password'}
                placeholder={
                  supabaseKeyIsSet
                    ? `القيمة الحالية: ${maskedSupabaseKey} — اتركه فارغاً للإبقاء عليها`
                    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                }
                value={form.supabaseKey}
                onChange={(e) => field('supabaseKey', e.target.value)}
                className="font-mono h-9 text-sm pe-10"
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
              مفتاح Service Role Key لإدارة المستخدمين والتسجيل الآمن (من Project Settings ← API).
            </p>
          </div>

          <SettingField
            id="supabaseTableName"
            label="اسم جدول المستخدمين (Table Name)"
            placeholder="app_users"
            value={form.supabaseTableName}
            onChange={(v) => field('supabaseTableName', v)}
            mono
            dir="ltr"
            description="الافتراضي: app_users"
          />
        </div>
      </div>

      {/* WhatsApp Reminders Card */}
      <div className="fade-in-up rounded-xl border border-emerald-500/30 bg-card overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-emerald-500/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                إعدادات تذكير الجلسات عبر الواتساب (WhatsApp)
              </p>
              <p className="text-xs text-muted-foreground">
                إرسال تذكيرات تلقائية قبل موعد الجلسة بـ 24 ساعة و 6 ساعات
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestWhatsapp}
            disabled={testingWhatsapp || !form.whatsappNumber}
            className="gap-2 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
          >
            <Send className="w-3.5 h-3.5" />
            {testingWhatsapp ? 'جارٍ الإرسال...' : 'اختبار إرسال الواتساب'}
          </Button>
        </div>

        <div className="p-5 space-y-4">
          <SettingField
            id="whatsappNumber"
            label="رقم الواتساب المخصص للتنبيهات (WhatsApp Number)"
            placeholder="+9665xxxxxxxx أو 05xxxxxxxx"
            value={form.whatsappNumber}
            onChange={(v) => field('whatsappNumber', v)}
            mono
            dir="ltr"
            description="الرقم المطلوب استلام التنبيهات والتذكيرات عليه قبل موعد الجلسة بـ 24 ساعة و 6 ساعات"
          />

          <SettingField
            id="whatsappApiUrl"
            label="رابط بوابة API الواتساب (اختياري - Gateway API URL)"
            placeholder="https://api.green-api.com أو https://api.ultramsg.com/..."
            value={form.whatsappApiUrl}
            onChange={(v) => field('whatsappApiUrl', v)}
            mono
            dir="ltr"
            description="اتركه فارغاً للاكتفاء بتسجيل وتنسيق التنبيهات في سجلات المنظومة (Console Logs)"
          />

          <div className="space-y-1.5">
            <Label htmlFor="whatsappToken" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              رمز الوصول / API Key لبوابة الواتساب (اختياري)
              {waTokenIsSet && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold normal-case tracking-normal text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ✔ محدَّد
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="whatsappToken"
                type={showWaToken ? 'text' : 'password'}
                placeholder={
                  waTokenIsSet
                    ? `القيمة الحالية: ${maskedWaToken} — اتركه فارغاً للإبقاء عليها`
                    : 'رمز API الخاص بمزود الواتساب'
                }
                value={form.whatsappToken}
                onChange={(e) => field('whatsappToken', e.target.value)}
                className="font-mono h-9 text-sm pe-10"
                dir="ltr"
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute inset-y-0 end-0 px-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowWaToken((v) => !v)}
                tabIndex={-1}
              >
                {showWaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">مفتاح المصادقة لبوابة إرسال رسائل الواتساب إذا لزم الأمر.</p>
          </div>

          <SettingField
            id="whatsappInstanceId"
            label="رقم Instance ID (لـ Green API فقط)"
            placeholder="7107XXXXXXXXXXXXXXXXX"
            value={form.whatsappInstanceId}
            onChange={(v) => field('whatsappInstanceId', v)}
            mono
            dir="ltr"
            description="أدخل Instance ID من لوحة تحكم Green API (console.greenapi.com). اتركه فارغاً إذا كنت تستخدم بوابة أخرى."
          />
        </div>
      </div>

      {/* Hugging Face Settings Card */}
      <div className="fade-in-up fade-in-up-delay-1 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
          <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">إعدادات Hugging Face (المستخرج الرئيسي للبيانات)</p>
            <p className="text-xs text-muted-foreground">تكوين النموذج والرمز المميز لاستخراج بيانات الجلسات</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hfApiToken" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              رمز الوصول الخاص بـ Hugging Face (Access Token)
              {hfTokenIsSet && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold normal-case tracking-normal text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ✔ محدَّد
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="hfApiToken"
                type={showHfToken ? 'text' : 'password'}
                placeholder={
                  hfTokenIsSet
                    ? `القيمة الحالية: ${maskedHfToken} — اتركه فارغاً للإبقاء عليها`
                    : 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                }
                value={form.hfApiToken}
                onChange={(e) => field('hfApiToken', e.target.value)}
                className="font-mono h-9 text-sm pe-10"
                dir="ltr"
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute inset-y-0 end-0 px-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowHfToken((v) => !v)}
                tabIndex={-1}
              >
                {showHfToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">رمز الوصول الخاص بك من Hugging Face لطلبات الاستدلال.</p>
          </div>

          <SettingField
            id="hfModel"
            label="نموذج Hugging Face (Model)"
            placeholder="meta-llama/Llama-3.1-8B-Instruct"
            value={form.hfModel}
            onChange={(v) => field('hfModel', v)}
            mono
            dir="ltr"
            description={`النموذج النشط حالياً: meta-llama/Llama-3.1-8B-Instruct`}
          />
        </div>
      </div>

      {/* AI Settings Card */}
      <div className="fade-in-up fade-in-up-delay-2 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">إعدادات مزود OpenAI / OpenRouter البديل</p>
            <p className="text-xs text-muted-foreground">إعدادات واجهة برمجة التطبيقات البديلة إن وجدت</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <SettingField
            id="aiBaseUrl"
            label="رابط المزود (Base URL)"
            placeholder="https://openrouter.ai/api/v1"
            value={form.aiBaseUrl}
            onChange={(v) => field('aiBaseUrl', v)}
            mono
            dir="ltr"
            testId="input-aiBaseUrl"
            description={`القيمة الافتراضية: https://openrouter.ai/api/v1`}
          />

          <div className="space-y-1.5">
            <Label htmlFor="aiApiKey" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              مفتاح API
              {tokenIsSet && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold normal-case tracking-normal text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ✔ محدَّد
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="aiApiKey"
                type={showToken ? 'text' : 'password'}
                placeholder={
                  tokenIsSet
                    ? `القيمة الحالية: ${maskedToken} — اتركه فارغاً للإبقاء عليها`
                    : 'sk-or-v1-xxxxxxxxxxxxxxxxxxxx'
                }
                value={form.aiApiKey}
                onChange={(e) => field('aiApiKey', e.target.value)}
                className="font-mono h-9 text-sm pe-10"
                dir="ltr"
                data-testid="input-aiApiKey"
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute inset-y-0 end-0 px-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowToken((v) => !v)}
                tabIndex={-1}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">أنشئ مفتاحاً من مزود الخدمة الخاص بك</p>
          </div>

          <SettingField
            id="aiModel"
            label="اسم النموذج"
            placeholder="qwen/qwen-2.5-7b-instruct"
            value={form.aiModel}
            onChange={(v) => field('aiModel', v)}
            mono
            dir="ltr"
            testId="input-aiModel"
            description={`القيمة الافتراضية: qwen/qwen-2.5-7b-instruct`}
          />
        </div>
      </div>

      {/* Google Sheets Card */}
      <div className="fade-in-up fade-in-up-delay-3 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <Sheet className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">إعدادات Google Sheets</p>
            <p className="text-xs text-muted-foreground">حدّد الجدول الذي سيُخزَّن فيه سجل الجلسات</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <SettingField
            id="googleSpreadsheetId"
            label="معرّف الجدول (Spreadsheet ID)"
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            value={form.googleSpreadsheetId}
            onChange={(v) => field('googleSpreadsheetId', v)}
            mono
            dir="ltr"
            testId="input-googleSpreadsheetId"
            description="انسخ الـ ID من رابط Google Sheet"
          />

          <SettingField
            id="googleSheetName"
            label="اسم الورقة (Sheet Name)"
            placeholder="Sessions"
            value={form.googleSheetName}
            onChange={(v) => field('googleSheetName', v)}
            dir="ltr"
            testId="input-googleSheetName"
            description="القيمة الافتراضية: Sessions"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="fade-in-up fade-in-up-delay-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="w-full gap-2 text-base font-bold h-12 shadow-sm"
          data-testid="button-save-settings"
        >
          <Save className="w-5 h-5" />
          {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </Button>
      </div>
    </div>
  );
}
