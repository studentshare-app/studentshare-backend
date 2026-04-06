import { supabase } from '@/lib/supabase';
import useAppStore from '@/store';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

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

  // Load token from secure storage
  useEffect(() => {
  const loadSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session) {
      setState({ user: session.user, loading: false, isAuthenticated: true });
      setUser(session.user);
    } else {
      setState({ user: null, loading: false, isAuthenticated: false });
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
      setState({ user: data.user, loading: false, isAuthenticated: true });
      setUser(data.user);
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync('auth_token');
    setState({ user: null, loading: false, isAuthenticated: false });
    setUser(null);
  }, []);

  return {
    ...state,
    login,
    logout,
  };
}
