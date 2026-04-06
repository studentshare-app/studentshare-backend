import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import * as SecureStore from 'expo-secure-store';

interface AppState {
  user: any | null;
  isPremium: boolean;
  posts: any[];
  setUser: (user: any) => void;
  setPremium: (status: boolean) => void;
  setPosts: (posts: any[]) => void;
  clearStore: () => void;
}

const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        isPremium: false,
        posts: [],
        setUser: (user) => set({ user }),
        setPremium: (status) => set({ isPremium: status }),
        setPosts: (posts) => set({ posts }),
        clearStore: () => set({ user: null, isPremium: false, posts: [] }),
      }),
      {
        name: 'app-storage',
        storage: createJSONStorage(() => ({
          getItem: async (name: string) => {
            const value = await SecureStore.getItemAsync(name);
            return value ?? null;
          },
          setItem: async (name: string, value: string) => {
            await SecureStore.setItemAsync(name, value);
          },
          removeItem: async (name: string) => {
            await SecureStore.deleteItemAsync(name);
          },
        })),
        partialize: (state) => ({ user: state.user, isPremium: state.isPremium }),
      }
    ),
    {
      name: 'StudentShare Store',
    }
  )
);

export default useAppStore;

