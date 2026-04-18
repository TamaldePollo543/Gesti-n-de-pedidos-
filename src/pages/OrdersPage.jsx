import { useEffect } from 'react'
import { useOrderStore, ORDER_STATUSES } from '../store/orderStore'
import { useAuthStore } from '../store/authStore'
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

export default function OrdersPage() {
  const { orders, isLoading, loadOrders, isOrderOffline } = useOrderStore()
  const waiter = useAuthStore((s) => s.waiter)

  useEffect(() => { loadOrders() }, [loadOrders])

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

              <p className={styles.itemsList}>
                {order.items.map((i) => `${i.qty}× ${i.name}`).join(' · ')}
              </p>

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
            </li>
          )
        })}
      </ul>
    </div>
  )
}
