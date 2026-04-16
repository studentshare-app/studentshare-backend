import { supabase } from '@/lib/supabase';
import useAppStore from '@/store';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface SupabaseUser {
  id: string;
  email: string;
  user_metadata: any;
}

type AuthState = {
  user: any | null;
  loading: boolean;
  isAuthenticated: boolean;
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthenticated: false,
  });

  const setUser = useAppStore((s: any) => s.setUser);

  useEffect(() => {
    const loadSession = async () => {
      try {
        // 1. Check local storage first — works offline
        const localToken = await SecureStore.getItemAsync('auth_token');

        if (localToken) {
          // We have a token locally, so the user was previously logged in.
          // Try to get the full session from Supabase (may fail offline).
          const { data: { session } } = await supabase.auth.getSession();

          if (session) {
            // Online and session is valid — use the fresh session
            setState({ user: session.user, loading: false, isAuthenticated: true });
            setUser(session.user);
          } else {
            // Offline or session fetch failed — trust the local token.
            // Restore minimal user state from the cached user in the store,
            // or set isAuthenticated: true so the user stays logged in.
            const cachedUser = useAppStore.getState().user;
            setState({ user: cachedUser, loading: false, isAuthenticated: true });
            // Don't call setUser here — the store already has the user
          }
        } else {
          // No local token at all — user has never logged in or explicitly logged out
          setState({ user: null, loading: false, isAuthenticated: false });
        }
      } catch (err) {
        // Any unexpected error: if we have a local token, stay logged in
        const localToken = await SecureStore.getItemAsync('auth_token').catch(() => null);
        if (localToken) {
          const cachedUser = useAppStore.getState().user;
          setState({ user: cachedUser, loading: false, isAuthenticated: true });
        } else {
          setState({ user: null, loading: false, isAuthenticated: false });
        }
      }
    };

    loadSession();
  }, []);

  // Login
  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.session) {
      await SecureStore.setItemAsync('auth_token', data.session.access_token);
      // Also persist the user object so it's available offline
      await SecureStore.setItemAsync('auth_user', JSON.stringify(data.user));
      setState({ user: data.user, loading: false, isAuthenticated: true });
      setUser(data.user);
    }
  }, []);

  // Logout
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('auth_user'); // clean up persisted user too
    queryClient.clear();
    setState({ user: null, loading: false, isAuthenticated: false });
    setUser(null);
  }, [queryClient]);

  return {
    ...state,
    login,
    logout,
  };
}