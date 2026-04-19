// RF-15: All communication via HTTPS. JWT in Authorization header.
// RF-14: waiter_id and ISO-8601 timestamp injected on every request.
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { supabase } from './supabaseClient'

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'https://api.mesaplus.local/v1'
const USE_DIRECT_SUPABASE_MENU = import.meta.env.VITE_USE_DIRECT_SUPABASE_MENU === 'true'
const ENABLE_ORDERS_API = import.meta.env.VITE_ENABLE_ORDERS_API === 'true'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
})

function unwrapPayload(payload) {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data
  }
  return payload
}

function ordersUnavailableError() {
  const error = new Error('Orders API no disponible en este entorno')
  error.response = { status: 503 }
  return error
}

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
  login: async (credentials) => {
    try {
      return await apiClient.post('/auth-login', credentials)
    } catch (error) {
      if (error?.response?.status === 404) {
        return apiClient.post('/auth/login', credentials)
      }
      throw error
    }
  },
}

function normalizeMenuResponse(payload) {
  // Soporta respuesta plana ([...]) o envuelta ({ data: [...] }).
  const raw = unwrapPayload(payload)
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []

  return items.map((item) => ({
    ...item,
    price: Number(item.price),
  }))
}

function normalizeOrdersResponse(payload) {
  const raw = unwrapPayload(payload)
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.orders) ? raw.orders : []

  return list.map((order) => ({
    ...order,
    items: Array.isArray(order.items) ? order.items : [],
  }))
}

export const menuAPI = {
  // RF-01: fetch only available=true items
  getMenu: async () => {
    // Por defecto usamos API central para respetar el token JWT del login actual.
    // Supabase directo queda como opcion solo si se habilita explicitamente.
    if (USE_DIRECT_SUPABASE_MENU && supabase) {
      const selectFields =
        'id,name,category,price,available,description,image,estimated_prep_time'

      const fromAppSchema = await supabase
        .schema('app')
        .from('menu_items')
        .select(selectFields)
        .eq('available', true)
        .order('name', { ascending: true })

      const fromPublicSchema =
        fromAppSchema.error || !Array.isArray(fromAppSchema.data)
          ? await supabase
              .from('menu_items')
              .select(selectFields)
              .eq('available', true)
              .order('name', { ascending: true })
          : fromAppSchema

      if (!fromPublicSchema.error && Array.isArray(fromPublicSchema.data)) {
        return {
          data: normalizeMenuResponse(fromPublicSchema.data),
        }
      }
    }

    try {
      const response = await apiClient.get('/menu-items?limit=200')
      return {
        data: normalizeMenuResponse(response.data).filter((item) => item?.available !== false),
      }
    } catch (error) {
      if (error?.response?.status === 404) {
        const response = await apiClient.get('/menu/items?available=true')
        return {
          data: normalizeMenuResponse(response.data).filter((item) => item?.available !== false),
        }
      }
      throw error
    }
  },

  getAllItems: async () => {
    try {
      const response = await apiClient.get('/menu-items?limit=300')
      return { data: normalizeMenuResponse(response.data) }
    } catch (error) {
      if (error?.response?.status === 404) {
        const response = await apiClient.get('/menu/items?available=true')
        return { data: normalizeMenuResponse(response.data) }
      }
      throw error
    }
  },

  updateAvailability: async (id, payload) => {
    try {
      return await apiClient.patch(`/menu-items/${id}/availability`, payload)
    } catch (error) {
      if (error?.response?.status === 404) {
        return apiClient.patch(`/menu/items/${id}/availability`, payload)
      }
      throw error
    }
  },
}

export const ordersAPI = {
  // RF-04: POST /orders — API retransmits to kitchen visualizer
  createOrder: async (order) => {
    if (!ENABLE_ORDERS_API) throw ordersUnavailableError()
    const response = await apiClient.post('/orders', order)
    return {
      ...response,
      data: unwrapPayload(response.data),
    }
  },
  // RF-05: get own orders (RNF-11: waiter sees only their own)
  getMyOrders: (waiterId) => {
    if (!ENABLE_ORDERS_API) throw ordersUnavailableError()
    return apiClient.get(`/orders?waiter_id=${waiterId}`)
  },

  getActiveOrders: async () => {
    if (!ENABLE_ORDERS_API) throw ordersUnavailableError()
    try {
      const response = await apiClient.get('/orders?active=true')
      return { data: normalizeOrdersResponse(response.data) }
    } catch (error) {
      if (error?.response?.status === 404) {
        const response = await apiClient.get('/orders')
        return { data: normalizeOrdersResponse(response.data) }
      }
      throw error
    }
  },

  updateStatus: async (orderId, status, dbId) => {
    if (!ENABLE_ORDERS_API) throw ordersUnavailableError()

    // Si conocemos el ID interno de DB, preferirlo para evitar 404 con IDs externos/locales.
    if (dbId) {
      try {
        return await apiClient.patch(`/orders/${dbId}/status`, { status })
      } catch (error) {
        if (error?.response?.status !== 404) throw error
      }
    }

    try {
      return await apiClient.patch(`/orders/${orderId}/status`, { status })
    } catch (error) {
      if (error?.response?.status === 404) {
        if (dbId) {
          try {
            return await apiClient.patch(`/orders/${dbId}`, { status })
          } catch (fallbackDbError) {
            if (fallbackDbError?.response?.status !== 404) throw fallbackDbError
          }
        }
        return apiClient.patch(`/orders/${orderId}`, { status })
      }
      throw error
    }
  },
}
