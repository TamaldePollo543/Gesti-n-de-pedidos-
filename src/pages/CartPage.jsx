// RF-03: Build order, adjust quantities, associate table/customer
// RF-04: POST /orders on confirm
// RNF-08: ≤3 touch interactions to complete flow
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useOrderStore } from '../store/orderStore'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import styles from './CartPage.module.css'

const TABLES = ['Mesa 1','Mesa 2','Mesa 3','Mesa 4','Mesa 5','Mesa 6','Mesa 7','Mesa 8','Mesa 9','Mesa 10','Mesa 11','Mesa 12']

export default function CartPage() {
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const {
    items, tableId, customerName,
    setTableId, setCustomerName,
    incrementQty, decrementQty, removeItem,
    clearCart, getTotal, isValid,
  } = useCartStore()
  const createOrder = useOrderStore((s) => s.createOrder)

  const total = getTotal()
  const valid = isValid()

  const handleConfirm = async () => {
    if (!valid) return
    const result = await createOrder(items, tableId, customerName, !isOnline)
    clearCart()
    navigate('/pedidos', { replace: true })
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--c-border-strong)" strokeWidth="1.2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p className={styles.emptyText}>El carrito está vacío</p>
        <button className={styles.goMenu} onClick={() => navigate('/menu')}>
          Ver menú
        </button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Confirmar pedido</h2>

      {/* Table + customer — RNF-08: this is touch interaction #1 */}
      <div className={styles.card}>
        <label className={styles.label} htmlFor="table">Mesa</label>
        <select
          id="table"
          className={styles.select}
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
        >
          <option value="">Seleccionar mesa…</option>
          {TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <label className={styles.label} htmlFor="customer">Nombre del cliente (opcional)</label>
        <input
          id="customer"
          className={styles.input}
          type="text"
          placeholder="Ej. Juan García"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </div>

      {/* Cart items — RNF-08: quantity adjust is touch #2 */}
      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Ítems ({items.length})</h3>
        <ul className={styles.itemList}>
          {items.map((item) => (
            <li key={item.id} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{item.name}</span>
                <span className={styles.itemUnit}>${item.price} c/u</span>
              </div>
              <div className={styles.qtyControls}>
                <button
                  className={styles.qtyBtn}
                  onClick={() => decrementQty(item.id)}
                  aria-label="Disminuir cantidad"
                >−</button>
                <span className={styles.qtyNum}>{item.qty}</span>
                <button
                  className={styles.qtyBtn}
                  onClick={() => incrementQty(item.id)}
                  aria-label="Aumentar cantidad"
                >+</button>
              </div>
              <span className={styles.itemTotal}>${item.price * item.qty}</span>
              <button
                className={styles.removeBtn}
                onClick={() => removeItem(item.id)}
                aria-label={`Eliminar ${item.name}`}
              >×</button>
            </li>
          ))}
        </ul>

        <div className={styles.totalRow}>
          <span>Total</span>
          <span className={styles.totalAmount}>${total}</span>
        </div>
      </div>

      {/* Confirm — RNF-08: touch #3 */}
      <button
        className={styles.confirmBtn}
        onClick={handleConfirm}
        disabled={!valid}
      >
        {!isOnline ? '💾 Guardar pedido (offline)' : '✓ Enviar a cocina'}
      </button>

      {!valid && (
        <p className={styles.hint}>Selecciona mesa o ingresa un nombre de cliente.</p>
      )}
    </div>
  )
}
