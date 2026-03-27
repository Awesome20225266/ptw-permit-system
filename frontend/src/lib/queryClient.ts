import { QueryClient } from '@tanstack/react-query'

/**
 * Singleton QueryClient — exported so LoginPage, api interceptors, and
 * anywhere else that needs to clear the cache on user-switch can import it.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})
