import { useEffect, useMemo, useRef, useState } from 'react'
import { menuAPI, ordersAPI } from '../services/api'
import { useMenuStore } from '../store/menuStore'
import { useOrderStore, ORDER_STATUSES } from '../store/orderStore'
import { useAuthStore } from '../store/authStore'
import { canManageKitchen } from '../utils/roles'
import styles from './KitchenPage.module.css'

const STATUS_COLUMNS = [
  { key: ORDER_STATUSES.PENDING, label: 'Pendiente' },
  { key: ORDER_STATUSES.PREPARING, label: 'En preparación' },
  { key: ORDER_STATUSES.READY, label: 'Listo' },
]
const envHideDelay = Number(import.meta.env.VITE_KITCHEN_HIDE_FINISHED_AFTER_MS)
const envOverrideTtl = Number(import.meta.env.VITE_KITCHEN_STATUS_OVERRIDE_TTL_MS)
const FINISHED_HIDE_DELAY_MS = Number.isFinite(envHideDelay) && envHideDelay > 0 ? envHideDelay : 30000
const STATUS_OVERRIDE_TTL_MS = Number.isFinite(envOverrideTtl) && envOverrideTtl > 0 ? envOverrideTtl : 15000

function listToCsv(value) {
  if (!Array.isArray(value) || value.length === 0) return ''
  return value.join(', ')
}

function csvToList(value) {
  if (!value || typeof value !== 'string') return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export default function KitchenPage() {
  const ordersApiEnabled = import.meta.env.VITE_ENABLE_ORDERS_API === 'true'
  const waiter = useAuthStore((s) => s.waiter)
  const isKitchenUser = canManageKitchen(waiter?.role)

  const menuItems = useMenuStore((s) => s.items)
  const setItems = useMenuStore((s) => s.setItems)
  const excludeItem = useMenuStore((s) => s.excludeItem)
  const restoreItem = useMenuStore((s) => s.restoreItem)

  const orders = useOrderStore((s) => s.orders)
  const setOrders = useOrderStore((s) => s.setOrders)
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus)
  const updateOrderData = useOrderStore((s) => s.updateOrderData)
  const removeOrder = useOrderStore((s) => s.removeOrder)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ordersUnavailable, setOrdersUnavailable] = useState(false)

  const [search, setSearch] = useState('')
  const [ingredientFilter, setIngredientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')

  const [page, setPage] = useState(1)
  const perPage = 50

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [reason, setReason] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editOrder, setEditOrder] = useState(null)
  const [editItems, setEditItems] = useState([])

  const [newOrdersCount, setNewOrdersCount] = useState(0)
  const [knownOrderIds, setKnownOrderIds] = useState(new Set())
  const [clockTs, setClockTs] = useState(Date.now())
  const hideTimersRef = useRef(new Map())
  const statusOverridesRef = useRef({})
  const orderDataOverridesRef = useRef({})
  const hiddenOrderIdsRef = useRef(new Set())
  const hiddenOrdersStorageKey = `kitchen:hiddenOrders:${waiter?.id || 'global'}`

  const persistHiddenOrderIds = (idsSet) => {
    try {
      localStorage.setItem(hiddenOrdersStorageKey, JSON.stringify(Array.from(idsSet)))
    } catch {
      // Ignorar errores de almacenamiento local.
    }
  }

  const addHiddenOrderId = (orderId) => {
    hiddenOrderIdsRef.current.add(String(orderId))
    persistHiddenOrderIds(hiddenOrderIdsRef.current)
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(hiddenOrdersStorageKey)
      const parsed = raw ? JSON.parse(raw) : []
      const list = Array.isArray(parsed) ? parsed.map((id) => String(id)) : []
      hiddenOrderIdsRef.current = new Set(list)
    } catch {
      hiddenOrderIdsRef.current = new Set()
    }
  }, [hiddenOrdersStorageKey])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError('')
      try {
        const menuRes = await menuAPI.getAllItems()
        setItems(menuRes.data || [])

        if (!ordersApiEnabled) {
          setOrders([])
          setOrdersUnavailable(true)
          setNotice('API de pedidos deshabilitada en este entorno. El panel funciona en modo local.')
          return
        }

        const ordersRes = await ordersAPI.getActiveOrders()
        const initial = (ordersRes.data || []).filter(
          (o) => !hiddenOrderIdsRef.current.has(String(o.id))
        )
        setOrders(initial)
        setKnownOrderIds(new Set(initial.map((o) => String(o.id))))
      } catch (err) {
        const status = err?.response?.status
        if (status === 404 || status === 503) {
          setOrders([])
          setOrdersUnavailable(true)
          setNotice('La API de pedidos no esta disponible. Puedes gestionar disponibilidad de items.')
        } else {
          setError(err?.response?.data?.message || 'No se pudo cargar el panel de cocina')
        }
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [setItems, setOrders])

  useEffect(() => {
    let mounted = true

    const refreshMenu = async () => {
      try {
        const menuRes = await menuAPI.getAllItems()
        if (mounted) setItems(menuRes.data || [])
      } catch {
        // Evitamos interrumpir flujo principal por fallas intermitentes.
      }
    }

    const timer = setInterval(refreshMenu, 5000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [setItems])

  useEffect(() => {
    if (!ordersApiEnabled || ordersUnavailable) return

    const timer = setInterval(async () => {
      try {
        const res = await ordersAPI.getActiveOrders()
        const now = Date.now()
        const freshRaw = res.data || []
        const fresh = freshRaw.map((order) => {
          const orderDataOverride = orderDataOverridesRef.current[String(order.id)]
          const override = statusOverridesRef.current[String(order.id)]
          const withItemOverride =
            orderDataOverride && orderDataOverride.until > now
              ? { ...order, ...orderDataOverride.patch }
              : order

          if (override && override.until > now) {
            return { ...withItemOverride, status: override.status }
          }
          return withItemOverride
        }).filter((order) => !hiddenOrderIdsRef.current.has(String(order.id)))

        Object.keys(statusOverridesRef.current).forEach((key) => {
          const override = statusOverridesRef.current[key]
          if (!override || override.until <= now) {
            delete statusOverridesRef.current[key]
          }
        })

        Object.keys(orderDataOverridesRef.current).forEach((key) => {
          const override = orderDataOverridesRef.current[key]
          if (!override || override.until <= now) {
            delete orderDataOverridesRef.current[key]
          }
        })

        const incoming = fresh.filter((o) => !knownOrderIds.has(String(o.id)))
        if (incoming.length > 0) {
          setNewOrdersCount((n) => n + incoming.length)
        }
        setKnownOrderIds(new Set(fresh.map((o) => String(o.id))))
        setOrders(fresh)
      } catch (err) {
        const status = err?.response?.status
        if (status === 404 || status === 503) {
          setOrdersUnavailable(true)
          setNotice('La API de pedidos no esta disponible temporalmente.')
        }
        // Reintento silencioso en siguiente ciclo.
      }
    }, 2000)

    return () => clearInterval(timer)
  }, [knownOrderIds, setOrders, ordersApiEnabled, ordersUnavailable])

  useEffect(() => {
    const ticker = setInterval(() => {
      setClockTs(Date.now())
    }, 1000)

    return () => clearInterval(ticker)
  }, [])

  useEffect(() => {
    const finishedStatuses = new Set([
      ORDER_STATUSES.READY,
      ORDER_STATUSES.SERVED,
      ORDER_STATUSES.CANCELLED,
    ])

    for (const order of orders) {
      const key = String(order.id)
      const isFinished = finishedStatuses.has(order.status)
      const existingEntry = hideTimersRef.current.get(key)

      if (isFinished && !existingEntry) {
        const expiresAt = Date.now() + FINISHED_HIDE_DELAY_MS
        const timer = setTimeout(() => {
          addHiddenOrderId(order.id)
          removeOrder(order.id)
          hideTimersRef.current.delete(key)
        }, FINISHED_HIDE_DELAY_MS)
        hideTimersRef.current.set(key, { timer, expiresAt })
      }

      if (!isFinished && existingEntry) {
        clearTimeout(existingEntry.timer)
        hideTimersRef.current.delete(key)
      }
    }
  }, [orders, removeOrder])

  useEffect(() => {
    return () => {
      hideTimersRef.current.forEach((entry) => clearTimeout(entry.timer))
      hideTimersRef.current.clear()
    }
  }, [])

  const getAutoHideSeconds = (orderId) => {
    const entry = hideTimersRef.current.get(String(orderId))
    if (!entry?.expiresAt) return null
    return Math.max(0, Math.ceil((entry.expiresAt - clockTs) / 1000))
  }

  const ingredients = useMemo(() => {
    const set = new Set()
    for (const item of menuItems) {
      for (const ing of item.ingredients || []) {
        if (ing?.name) set.add(ing.name)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }, [menuItems])

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch =
        !search || item.name.toLowerCase().includes(search.toLowerCase())

      const matchesIngredient =
        !ingredientFilter ||
        (item.ingredients || []).some((ing) => ing.name === ingredientFilter)

      return matchesSearch && matchesIngredient
    })
  }, [menuItems, search, ingredientFilter])

  const activeOrders = useMemo(() => {
    const visibleStatuses = [
      ORDER_STATUSES.PENDING,
      ORDER_STATUSES.PREPARING,
      ORDER_STATUSES.READY,
    ]

    const base = orders.filter((order) => visibleStatuses.includes(order.status))
    if (statusFilter === 'todos') return base
    return base.filter((order) => order.status === statusFilter)
  }, [orders, statusFilter])

  const pagedOrders = useMemo(() => {
    const from = (page - 1) * perPage
    const to = from + perPage
    return activeOrders.slice(from, to)
  }, [activeOrders, page])

  const pages = Math.max(1, Math.ceil(activeOrders.length / perPage))

  const groupedOrders = useMemo(() => {
    return STATUS_COLUMNS.reduce((acc, col) => {
      acc[col.key] = pagedOrders.filter((order) => order.status === col.key)
      return acc
    }, {})
  }, [pagedOrders])

  const excludedCount = filteredItems.filter((i) => i.available === false).length

  const openExcludeModal = (item) => {
    setSelectedItem(item)
    setReason(item.unavailableReason || '')
    setConfirmOpen(true)
  }

  const closeModal = () => {
    setConfirmOpen(false)
    setSelectedItem(null)
    setReason('')
  }

  const onToggleAvailability = async (item, nextAvailable) => {
    if (!isKitchenUser) return

    if (!nextAvailable) {
      openExcludeModal(item)
      return
    }

    try {
      await menuAPI.updateAvailability(item.id, {
        available: true,
        item_id: item.id,
        user_id: waiter?.id,
        timestamp: new Date().toISOString(),
      })
      restoreItem(item.id)
      setNotice(`Ítem ${item.name} reincorporado al menú.`)
    } catch (err) {
      setError(err?.response?.data?.message || 'No fue posible reincorporar el ítem')
    }
  }

  const confirmExclude = async () => {
    if (!selectedItem || !reason.trim()) return

    try {
      const res = await menuAPI.updateAvailability(selectedItem.id, {
        available: false,
        reason: reason.trim(),
        item_id: selectedItem.id,
        user_id: waiter?.id,
        timestamp: new Date().toISOString(),
      })

      const payload = res?.data?.data || res?.data || {}
      const affected = Number(
        payload.affected_orders_count ||
          payload.affectedOrders ||
          payload.pending_orders_count ||
          0
      )

      excludeItem(selectedItem.id, reason.trim())
      if (affected > 0) {
        setNotice(`Hay ${affected} pedido(s) pendiente(s) con este ítem. Los meseros han sido notificados.`)
      } else {
        setNotice(`Ítem ${selectedItem.name} marcado como no disponible.`)
      }
      closeModal()
    } catch (err) {
      setError(err?.response?.data?.message || 'No fue posible excluir el ítem')
    }
  }

  const onMoveStatus = async (order, status) => {
    const isLikelyLocalOnly = !order?.db_id && String(order?.id || '').startsWith('ORD-')

    updateOrderStatus(order.id, status)
    statusOverridesRef.current[String(order.id)] = {
      status,
      until: Date.now() + STATUS_OVERRIDE_TTL_MS,
    }

    if (!ordersApiEnabled || ordersUnavailable) {
      setNotice('Estado actualizado localmente (API de pedidos no disponible).')
      return
    }

    if (isLikelyLocalOnly) {
      setNotice('Pedido local aun no sincronizado. Estado actualizado solo en esta vista.')
      return
    }

    try {
      await ordersAPI.updateStatus(order.id, status, order.db_id)
    } catch (err) {
      const statusCode = err?.response?.status
      if (statusCode === 404 || statusCode === 503) {
        setNotice('No se encontro el pedido en backend. Estado actualizado localmente.')
        return
      }
      setError(err?.response?.data?.message || 'No se pudo actualizar el estado del pedido')
    }
  }

  const openEditOrder = (order) => {
    if (!order) return
    const baseItems = Array.isArray(order.items) ? order.items : []
    const draftItems = baseItems.map((item) => ({
      id: item.id,
      name: item.name || '',
      qty: Number(item.qty || 1),
      extrasText: listToCsv(item.extras),
      exclusionsText: listToCsv(item.exclusions),
      allergyNotes: item.allergyNotes || item.allergy_notes || '',
      kitchenNotes: item.kitchenNotes || item.notes || '',
    }))

    setEditOrder(order)
    setEditItems(draftItems)
    setEditOpen(true)
  }

  const closeEditOrder = () => {
    setEditOpen(false)
    setEditOrder(null)
    setEditItems([])
  }

  const updateDraftItem = (index, key, value) => {
    setEditItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)))
  }

  const removeDraftItem = (index) => {
    setEditItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const addDraftItem = () => {
    setEditItems((prev) => [
      ...prev,
      {
        name: '',
        qty: 1,
        extrasText: '',
        exclusionsText: '',
        allergyNotes: '',
        kitchenNotes: '',
      },
    ])
  }

  const saveOrderEdition = async () => {
    if (!editOrder) return

    const nextItems = editItems
      .map((item) => ({
        id: item.id,
        name: String(item.name || '').trim(),
        qty: Math.max(1, Number(item.qty || 1)),
        extras: csvToList(item.extrasText),
        exclusions: csvToList(item.exclusionsText),
        allergyNotes: String(item.allergyNotes || '').trim(),
        kitchenNotes: String(item.kitchenNotes || '').trim(),
      }))
      .filter((item) => item.name)

    if (nextItems.length === 0) {
      setError('El pedido debe tener al menos un ítem válido.')
      return
    }

    updateOrderData(editOrder.id, { items: nextItems })
    orderDataOverridesRef.current[String(editOrder.id)] = {
      patch: { items: nextItems },
      until: Date.now() + STATUS_OVERRIDE_TTL_MS,
    }

    const isLikelyLocalOnly = !editOrder?.db_id && String(editOrder?.id || '').startsWith('ORD-')
    if (!ordersApiEnabled || ordersUnavailable) {
      setNotice('Pedido editado localmente (API de pedidos no disponible).')
      closeEditOrder()
      return
    }

    if (isLikelyLocalOnly) {
      setNotice('Pedido local aun no sincronizado. Edicion aplicada solo en esta vista.')
      closeEditOrder()
      return
    }

    try {
      await ordersAPI.updateOrder(editOrder.id, { items: nextItems }, editOrder.db_id)
      setNotice(`Pedido ${editOrder.id} actualizado correctamente.`)
      closeEditOrder()
    } catch (err) {
      const statusCode = err?.response?.status
      if (statusCode === 404 || statusCode === 422 || statusCode === 503) {
        setNotice('No se encontro endpoint de edicion en backend. Cambios aplicados localmente.')
        closeEditOrder()
        return
      }
      setError(err?.response?.data?.message || 'No se pudo editar el pedido')
    }
  }

  if (!isKitchenUser) {
    return (
      <div className={styles.denied}>
        <h2>Acceso restringido</h2>
        <p>Solo cocina o gerencia pueden gestionar este panel.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Cargando panel de cocina...</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2>Panel de cocina</h2>
        <div className={styles.badges}>
          <span className={styles.badge}>Pedidos nuevos: {newOrdersCount}</span>
          <span className={styles.badge}>Ítems excluidos: {excludedCount}</span>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      {ordersUnavailable && (
        <div className={styles.notice}>
          Modo degradado: no hay sincronizacion de pedidos con backend en este entorno.
        </div>
      )}

      <section className={styles.ordersSection}>
        <div className={styles.sectionHeader}>
          <h3>Pedidos activos</h3>
          <div className={styles.filters}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="todos">Todos</option>
              <option value={ORDER_STATUSES.PENDING}>Pendiente</option>
              <option value={ORDER_STATUSES.PREPARING}>En preparación</option>
              <option value={ORDER_STATUSES.READY}>Listo</option>
            </select>
          </div>
        </div>

        <div className={styles.columns}>
          {STATUS_COLUMNS.map((col) => (
            <div key={col.key} className={styles.column}>
              <h4>{col.label}</h4>
              <div className={styles.cards}>
                {(groupedOrders[col.key] || []).map((order) => (
                  <article key={order.id} className={styles.orderCard}>
                    <div className={styles.orderTop}>
                      <strong>{order.id}</strong>
                      <span>
                        {new Date(order.created_at || order.timestamp).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className={styles.orderMeta}>
                      Mesa/Cliente: {order.table_id || order.customer_name || '-'}
                    </p>
                    <ul>
                      {(order.items || []).map((i, idx) => (
                        <li key={`${order.id}-${idx}`}>
                          {i.qty || 1}x {i.name}
                          {Array.isArray(i.extras) && i.extras.length > 0 && (
                            <div className={styles.itemNote}>Extras: {i.extras.join(', ')}</div>
                          )}
                          {Array.isArray(i.exclusions) && i.exclusions.length > 0 && (
                            <div className={styles.itemNote}>Sin: {i.exclusions.join(', ')}</div>
                          )}
                          {(i.allergyNotes || i.allergy_notes) && (
                            <div className={styles.itemAlert}>Alergia: {i.allergyNotes || i.allergy_notes}</div>
                          )}
                          {(i.kitchenNotes || i.notes) && (
                            <div className={styles.itemNote}>Nota: {i.kitchenNotes || i.notes}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                    {order.status === ORDER_STATUSES.READY && (
                      <p className={styles.autoHideHint}>
                        Se oculta en {getAutoHideSeconds(order.id) ?? Math.ceil(FINISHED_HIDE_DELAY_MS / 1000)}s
                      </p>
                    )}
                    <div className={styles.cardActions}>
                      {(order.status === ORDER_STATUSES.PENDING || order.status === ORDER_STATUSES.PREPARING) && (
                        <button onClick={() => openEditOrder(order)}>Editar pedido</button>
                      )}
                      {order.status === ORDER_STATUSES.PENDING && (
                        <button onClick={() => onMoveStatus(order, ORDER_STATUSES.PREPARING)}>
                          En preparación
                        </button>
                      )}
                      {order.status === ORDER_STATUSES.PREPARING && (
                        <button onClick={() => onMoveStatus(order, ORDER_STATUSES.READY)}>
                          Marcar listo
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>

        {activeOrders.length > perPage && (
          <div className={styles.pagination}>
            <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Anterior
            </button>
            <span>Página {page} de {pages}</span>
            <button disabled={page === pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              Siguiente
            </button>
          </div>
        )}
      </section>

      <section className={styles.itemsSection}>
        <div className={styles.sectionHeader}>
          <h3>Disponibilidad de ítems</h3>
          <div className={styles.filters}>
            <input
              type="search"
              placeholder="Buscar ítem"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={ingredientFilter} onChange={(e) => setIngredientFilter(e.target.value)}>
              <option value="">Todos los ingredientes</option>
              {ingredients.map((ingredient) => (
                <option key={ingredient} value={ingredient}>{ingredient}</option>
              ))}
            </select>
          </div>
        </div>

        <ul className={styles.itemList}>
          {filteredItems.map((item) => (
            <li key={item.id} className={item.available === false ? styles.unavailable : ''}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.category}</p>
                {item.unavailableReason && <small>Razón: {item.unavailableReason}</small>}
              </div>
              <div className={styles.itemActions}>
                {item.available === false ? (
                  <button onClick={() => onToggleAvailability(item, true)}>Reincorporar</button>
                ) : (
                  <button onClick={() => onToggleAvailability(item, false)}>Excluir</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {confirmOpen && selectedItem && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h3>Confirmar exclusión</h3>
            <p>
              Vas a excluir <strong>{selectedItem.name}</strong>. Esta acción notificará a los meseros.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Razón (ej. sin tomate, sin tortilla, sin queso)"
              rows={3}
            />
            <div className={styles.modalActions}>
              <button onClick={closeModal}>Cancelar</button>
              <button disabled={!reason.trim()} onClick={confirmExclude}>Confirmar exclusión</button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editOrder && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalLarge}>
            <h3>Editar pedido {editOrder.id}</h3>
            <p>Solo se puede editar cuando el pedido está pendiente o en preparación.</p>

            <div className={styles.editHeader}>
              <button onClick={addDraftItem}>Agregar ítem</button>
            </div>

            <div className={styles.editRows}>
              {editItems.map((item, index) => (
                <div key={`${editOrder.id}-edit-${index}`} className={styles.editRow}>
                  <input
                    value={item.name}
                    onChange={(e) => updateDraftItem(index, 'name', e.target.value)}
                    placeholder="Nombre del ítem"
                  />
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateDraftItem(index, 'qty', e.target.value)}
                    placeholder="Cantidad"
                  />
                  <input
                    value={item.extrasText}
                    onChange={(e) => updateDraftItem(index, 'extrasText', e.target.value)}
                    placeholder="Extras (coma separado)"
                  />
                  <input
                    value={item.exclusionsText}
                    onChange={(e) => updateDraftItem(index, 'exclusionsText', e.target.value)}
                    placeholder="Excluir ingredientes (coma separado)"
                  />
                  <input
                    value={item.allergyNotes}
                    onChange={(e) => updateDraftItem(index, 'allergyNotes', e.target.value)}
                    placeholder="Alergias"
                  />
                  <input
                    value={item.kitchenNotes}
                    onChange={(e) => updateDraftItem(index, 'kitchenNotes', e.target.value)}
                    placeholder="Nota adicional"
                  />
                  <button onClick={() => removeDraftItem(index)}>Quitar</button>
                </div>
              ))}
            </div>

            <div className={styles.modalActions}>
              <button onClick={closeEditOrder}>Cancelar</button>
              <button onClick={saveOrderEdition}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
