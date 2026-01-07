'use client';

import { useSession, signOut as authSignOut } from '../lib/auth-client';
import { useCallback } from 'react';

export function useAuth() {
  const { data: session, isPending, error } = useSession();

  const signOut = useCallback(async () => {
    await authSignOut();
    window.location.href = '/login';
  }, []);

  return {
    user: session?.user ?? null,
    isAuthenticated: !!session?.user,
    isLoading: isPending,
    error: error?.message ?? null,
    signOut,
  };
}
