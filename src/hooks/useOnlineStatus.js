// RNF-06: Detect online/offline status, trigger sync on reconnect
import { useState, useEffect, useCallback } from 'react'
import { useOrderStore } from '../store/orderStore'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const syncOfflineQueue = useOrderStore((s) => s.syncOfflineQueue)
  const pendingCount = useOrderStore((s) => s.getPendingCount())

  const handleOnline = useCallback(async () => {
    setIsOnline(true)
    // Auto-sync when connection is restored (RNF-06)
    if (pendingCount > 0) {
      await syncOfflineQueue()
    }
  }, [syncOfflineQueue, pendingCount])

  const handleOffline = useCallback(() => {
    setIsOnline(false)
  }, [])

  useEffect(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  return isOnline
}
