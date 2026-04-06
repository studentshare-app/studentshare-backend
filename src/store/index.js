import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import * as SecureStore from 'expo-secure-store';

const useAppStore = create()(
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
        storage: {
          getItem: async (name) => {
            const value = await SecureStore.getItemAsync(name);
            return value ? JSON.stringify(value) : null;
          },
          setItem: async (name, value) => {
            await SecureStore.setItemAsync(name, JSON.parse(value));
          },
          removeItem: async (name) => {
            await SecureStore.deleteItemAsync(name);
          },
        },
        partialize: (state) => ({ user: state.user, isPremium: state.isPremium }),
      }
    ),
    {
      name: 'StudentShare Store',
    }
  )
);

export default useAppStore;

