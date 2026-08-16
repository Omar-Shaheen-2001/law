import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetCurrentUser } from '@workspace/api-client-react';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const [, navigate] = useLocation();
  const { data: user, isLoading, isError } = useGetCurrentUser();

  useEffect(() => {
    if (isLoading) return; // Wait until auth check completes

    if (isError || !user) {
      navigate('/admin/login', { replace: true });
    } else if ((user as any).role !== 'admin') {
      // Logged-in staff user — redirect to the sessions app
      navigate('/', { replace: true });
    }
  }, [user, isLoading, isError, navigate]);

  // Show loader while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-xs text-muted-foreground">جارٍ التحقق من صلاحيات المشرف العام...</p>
        </div>
      </div>
    );
  }

  // While redirecting, render nothing
  if (isError || !user || (user as any).role !== 'admin') {
    return null;
  }

  return <>{children}</>;
}
