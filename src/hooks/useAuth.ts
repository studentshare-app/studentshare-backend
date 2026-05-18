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
    let mounted = true;

    const loadSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (session?.user) {
          setState({ user: session.user, loading: false, isAuthenticated: true });
          // Ensure Zustand store is synced with active session, especially for OAuth logins
          setUser(session.user);
        } else {
          // Offline fallback
          const cachedUser = useAppStore.getState().user;
          if (cachedUser) {
            setState({ user: cachedUser, loading: false, isAuthenticated: true });
          } else {
            setState({ user: null, loading: false, isAuthenticated: false });
          }
        }
      } catch (err) {
        if (!mounted) return;
        const cachedUser = useAppStore.getState().user;
        if (cachedUser) {
          setState({ user: cachedUser, loading: false, isAuthenticated: true });
        } else {
          setState({ user: null, loading: false, isAuthenticated: false });
        }
      }
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setState({ user: session.user, loading: false, isAuthenticated: true });
          setUser(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        setState({ user: null, loading: false, isAuthenticated: false });
        // Don't call setUser(null) here to keep offline cache if we just lost connection,
        // RootLayout decides when to truly log out.
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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