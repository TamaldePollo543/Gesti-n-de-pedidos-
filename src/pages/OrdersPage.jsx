import { useEffect, useState } from 'react'
import { useOrderStore, ORDER_STATUSES } from '../store/orderStore'
import { useAuthStore } from '../store/authStore'
import { ordersAPI } from '../services/api'
import styles from './OrdersPage.module.css'

const STATUS_LABEL = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: '¡Listo!',
  servido: 'Servido',
  cancelado: 'Cancelado',
}

const STATUS_CLASS = {
  pendiente: 'pending',
  en_preparacion: 'preparing',
  listo: 'ready',
  servido: 'served',
  cancelado: 'cancelled',
}

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

export default function OrdersPage() {
  const { orders, isLoading, loadOrders, isOrderOffline, updateOrderData } = useOrderStore()
  const waiter = useAuthStore((s) => s.waiter)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editOrder, setEditOrder] = useState(null)
  const [editItems, setEditItems] = useState([])

  useEffect(() => { loadOrders() }, [loadOrders])

  const canEditOrder = (status) =>
    status === ORDER_STATUSES.PENDING || status === ORDER_STATUSES.PREPARING

  const openEditOrder = (order) => {
    const baseItems = Array.isArray(order.items) ? order.items : []
    setEditOrder(order)
    setEditItems(
      baseItems.map((item) => ({
        id: item.id,
        name: item.name || '',
        qty: Number(item.qty || 1),
        extrasText: listToCsv(item.extras),
        exclusionsText: listToCsv(item.exclusions),
        allergyNotes: item.allergyNotes || item.allergy_notes || '',
        kitchenNotes: item.kitchenNotes || item.notes || '',
      }))
    )
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

  const removeDraftItem = (index) => {
    setEditItems((prev) => prev.filter((_, idx) => idx !== index))
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

    const isLikelyLocalOnly = !editOrder?.db_id && String(editOrder?.id || '').startsWith('ORD-')
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

  if (isLoading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Cargando pedidos…</p>
      </div>
    )
  }

  if (!orders.length) {
    return (
      <div className={styles.center}>
        <p className={styles.emptyText}>No hay pedidos todavía.</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Mis pedidos</h2>
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      <ul className={styles.list}>
        {orders.map((order) => {
          const offline = isOrderOffline(order.id)
          return (
            <li key={order.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.tableLabel}>
                    {order.table_id || order.customer_name || '—'}
                  </p>
                  <p className={styles.orderId}>{order.id}</p>
                </div>
                <span className={`${styles.badge} ${styles[STATUS_CLASS[order.status] || 'pending']}`}>
                  {STATUS_LABEL[order.status] || order.status}
                </span>
              </div>

              <div className={styles.itemsList}>
                {order.items.map((i, idx) => (
                  <div key={`${order.id}-${idx}`} className={styles.itemRow}>
                    <span>{i.qty}× {i.name}</span>
                    {Array.isArray(i.extras) && i.extras.length > 0 && (
                      <span className={styles.itemNote}>Extras: {i.extras.join(', ')}</span>
                    )}
                    {Array.isArray(i.exclusions) && i.exclusions.length > 0 && (
                      <span className={styles.itemNote}>Sin: {i.exclusions.join(', ')}</span>
                    )}
                    {(i.allergyNotes || i.allergy_notes) && (
                      <span className={styles.itemAlert}>Alergia: {i.allergyNotes || i.allergy_notes}</span>
                    )}
                    {(i.kitchenNotes || i.notes) && (
                      <span className={styles.itemNote}>Nota: {i.kitchenNotes || i.notes}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.cardFooter}>
                <span className={styles.time}>
                  {new Date(order.created_at || order.timestamp).toLocaleTimeString('es-MX', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                {/* RNF-07: show sync indicator for offline orders */}
                {offline && (
                  <span className={styles.syncNote}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Pendiente de sync
                  </span>
                )}
                <span className={styles.total}>
                  ${order.items.reduce((s, i) => s + i.price * i.qty, 0)}
                </span>
              </div>

              {canEditOrder(order.status) && (
                <div className={styles.editActions}>
                  <button className={styles.editBtn} onClick={() => openEditOrder(order)}>
                    Editar pedido
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {editOpen && editOrder && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h3>Editar pedido {editOrder.id}</h3>
            <p>Disponible solo en pendiente y en preparación.</p>

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
