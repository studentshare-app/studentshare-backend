import { Session } from '@supabase/supabase-js'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/core/api/supabase'
import * as SecureStore from 'expo-secure-store'
import NetInfo from '@react-native-community/netinfo'

type AuthContextType = {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({ session: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession(session)
        setLoading(false)
      } else {
        // Offline fallback — restore user from persisted Zustand store
        try {
          const raw = await SecureStore.getItemAsync('app-storage')
          if (raw) {
            const parsed = JSON.parse(raw)
            const user = parsed?.state?.user
            const token = await SecureStore.getItemAsync('auth_token').catch(() => null)
            if (user && token) {
              setSession({ user, access_token: token } as any)
            }
          }
        } catch {}
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // ✅ Check network before processing sign-out
        const net = await NetInfo.fetch().catch(() => ({ isConnected: true }))
        if (!net.isConnected) {
          console.log('[AuthCtx] SIGNED_OUT received while offline — ignoring')
          return
        }

        SecureStore.getItemAsync('auth_token').then(token => {
          if (!token) setSession(null)
        }).catch(() => setSession(null))
        return
      }
      if (session) setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)