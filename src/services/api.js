// RF-15: All communication via HTTPS. JWT in Authorization header.
// RF-14: waiter_id and ISO-8601 timestamp injected on every request.
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.mesaplus.local/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach JWT + waiter_id + timestamp ──────────────────
apiClient.interceptors.request.use((config) => {
  const { token, waiter } = useAuthStore.getState()

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }

  // RF-14: inject audit fields on mutating requests
  if (['post', 'put', 'patch'].includes(config.method)) {
    config.data = {
      ...config.data,
      waiter_id: waiter?.id,
      timestamp: new Date().toISOString(),
    }
  }

  return config
})

// ── Response interceptor: handle 401/403 ─────────────────────────────────────
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    // RNF-11: 403 means role restriction — caller decides how to surface it
    return Promise.reject(error)
  }
)

// ── Exponential backoff retry ─────────────────────────────────────────────────
export async function withRetry(fn, maxAttempts = 4, baseDelay = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isLast = attempt === maxAttempts
      const isNetworkError = !err.response
      if (isLast || !isNetworkError) throw err
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

// ── API methods ───────────────────────────────────────────────────────────────
export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
}

export const menuAPI = {
  // RF-01: fetch only available=true items
  getMenu: () => apiClient.get('/menu/items?available=true'),
}

export const ordersAPI = {
  // RF-04: POST /orders — API retransmits to kitchen visualizer
  createOrder: (order) => apiClient.post('/orders', order),
  // RF-05: get own orders (RNF-11: waiter sees only their own)
  getMyOrders: (waiterId) => apiClient.get(`/orders?waiter_id=${waiterId}`),
}
