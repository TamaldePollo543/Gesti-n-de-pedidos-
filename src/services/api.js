// RF-15: All communication via HTTPS. JWT in Authorization header.
// RF-14: waiter_id and ISO-8601 timestamp injected on every request.
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { supabase } from './supabaseClient'

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'https://api.mesaplus.local/v1'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const USE_DIRECT_SUPABASE_MENU = import.meta.env.VITE_USE_DIRECT_SUPABASE_MENU === 'true'
const ENABLE_ORDERS_API = import.meta.env.VITE_ENABLE_ORDERS_API === 'true'
const ENABLE_ORDER_EDIT_API = import.meta.env.VITE_ENABLE_ORDER_EDIT_API === 'true'
let refreshPromise = null

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

async function refreshAccessToken() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase auth refresh no configurado')
  }

  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) {
    throw new Error('No existe refresh token')
  }

  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`
  const response = await axios.post(
    url,
    { refresh_token: refreshToken },
    {
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    }
  )

  const nextAccessToken = response?.data?.access_token
  const nextRefreshToken = response?.data?.refresh_token
  const expiresIn = response?.data?.expires_in

  if (!nextAccessToken) {
    throw new Error('No se recibio access_token al refrescar sesion')
  }

  useAuthStore.getState().setSessionTokens(nextAccessToken, nextRefreshToken, expiresIn)
  return nextAccessToken
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
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        }

        const newToken = await refreshPromise
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        return apiClient(originalRequest)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
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

  const parseNoteSegment = (notes, label) => {
    if (!notes || typeof notes !== 'string') return ''
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = notes.match(new RegExp(`${escaped}:\\s*([^|]+)`, 'i'))
    return (match?.[1] || '').trim()
  }

  const splitCsv = (value) =>
    String(value || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)

  const normalizeOrderItem = (item = {}) => {
    const notes = item.notes || item.kitchenNotes || item.kitchen_notes || ''
    const extras = Array.isArray(item.extras)
      ? item.extras
      : splitCsv(parseNoteSegment(notes, 'Extras'))
    const exclusions = Array.isArray(item.exclusions)
      ? item.exclusions
      : splitCsv(parseNoteSegment(notes, 'Sin'))
    const allergyFromNote = parseNoteSegment(notes, 'Alergia')
    const allergy = item.allergyNotes || item.allergy_notes || allergyFromNote || ''
    const kitchenNoteFromText = parseNoteSegment(notes, 'Nota')

    return {
      ...item,
      name: item.name || item.item_name || 'Ítem',
      qty: Number(item.qty || item.quantity || 1),
      extras,
      exclusions,
      allergyNotes: allergy,
      allergy_notes: allergy,
      kitchenNotes: item.kitchenNotes || item.kitchen_notes || kitchenNoteFromText || notes,
      notes,
    }
  }

  return list.map((order) => ({
    ...order,
    items: Array.isArray(order.items) ? order.items.map(normalizeOrderItem) : [],
  }))
}

function buildItemNotes(item = {}) {
  const extras = Array.isArray(item.extras) ? item.extras : []
  const exclusions = Array.isArray(item.exclusions) ? item.exclusions : []
  const allergy = String(item.allergyNotes || item.allergy_notes || '').trim()
  const kitchenNote = String(item.kitchenNotes || item.kitchen_notes || item.notes || '').trim()
  const parts = []

  if (extras.length > 0) parts.push(`Extras: ${extras.join(', ')}`)
  if (exclusions.length > 0) parts.push(`Sin: ${exclusions.join(', ')}`)
  if (allergy) parts.push(`Alergia: ${allergy}`)
  if (kitchenNote) parts.push(`Nota: ${kitchenNote}`)

  return parts.join(' | ')
}

function serializeOrderItemsForApi(items = []) {
  if (!Array.isArray(items)) return []
  return items.map((item = {}) => ({
    id: item.id,
    name: item.name,
    price: Number(item.price || 0),
    qty: Math.max(1, Number(item.qty || item.quantity || 1)),
    notes: buildItemNotes(item),
  }))
}

function serializeOrderPayloadForApi(payload = {}) {
  if (!payload || typeof payload !== 'object') return payload
  if (!Array.isArray(payload.items)) return payload
  return {
    ...payload,
    items: serializeOrderItemsForApi(payload.items),
  }
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
    const response = await apiClient.post('/orders', serializeOrderPayloadForApi(order))
    return {
      ...response,
      data: unwrapPayload(response.data),
    }
  },
  // RF-05: get own orders (RNF-11: waiter sees only their own)
  getMyOrders: async (waiterId) => {
    if (!ENABLE_ORDERS_API) throw ordersUnavailableError()
    try {
      const response = await apiClient.get(`/orders?waiter_id=${waiterId}`)
      return { data: normalizeOrdersResponse(response.data) }
    } catch (error) {
      if (error?.response?.status === 404) {
        const response = await apiClient.get('/orders')
        return { data: normalizeOrdersResponse(response.data) }
      }
      throw error
    }
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

  updateOrder: async (orderId, payload, dbId) => {
    if (!ENABLE_ORDERS_API) throw ordersUnavailableError()
    if (!ENABLE_ORDER_EDIT_API) {
      const disabledError = new Error('Edicion remota de pedidos deshabilitada en este entorno')
      disabledError.response = { status: 404 }
      throw disabledError
    }
    const safePayload = serializeOrderPayloadForApi(payload)

    const candidateIds = [dbId, orderId].filter(Boolean)

    for (const id of candidateIds) {
      try {
        return await apiClient.patch(`/orders/${id}`, safePayload)
      } catch (error) {
        if (![404, 422].includes(error?.response?.status)) throw error
      }

      try {
        return await apiClient.put(`/orders/${id}`, safePayload)
      } catch (error) {
        if (![404, 422].includes(error?.response?.status)) throw error
      }

      try {
        return await apiClient.patch(`/orders/${id}/update`, safePayload)
      } catch (error) {
        if (![404, 422].includes(error?.response?.status)) throw error
      }
    }

    const notFoundError = new Error('No se encontro endpoint de actualizacion de pedidos')
    notFoundError.response = { status: 404 }
    throw notFoundError
  },
}
