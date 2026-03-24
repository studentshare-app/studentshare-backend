import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { persistQueryClient } from '@tanstack/react-query-persist-client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // data stays fresh for 5 minutes
      gcTime: 1000 * 60 * 60 * 24,   // keep unused data in cache for 24 hours
      retry: 2,
      retryDelay: 1000,
    },
  },
})

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'studentshare-query-cache',
})

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24, // persist cache for 24 hours
})