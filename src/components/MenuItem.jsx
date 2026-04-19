// RNF-09: Unavailable items → gray bg (#9CA3AF), strikethrough text, lock icon + "Agotado"
// RNF-10: Touch targets ≥ 44×44px
import styles from './MenuItem.module.css'

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

export default function MenuItem({ item, cartQty, onAdd }) {
  const unavailable = !item.available

  return (
    <div
      className={`${styles.card} ${unavailable ? styles.unavailable : ''}`}
      role="listitem"
      onClick={unavailable ? undefined : onAdd}
      aria-disabled={unavailable}
      tabIndex={unavailable ? -1 : 0}
      onKeyDown={(e) => { if (!unavailable && (e.key === 'Enter' || e.key === ' ')) onAdd() }}
    >
      {/* Unavailable badge — RNF-09 */}
      {unavailable && (
        <span className={styles.unavailBadge} aria-label="No disponible">
          <LockIcon /> No disponible
        </span>
      )}

      {/* In-cart indicator */}
      {cartQty > 0 && !unavailable && (
        <span className={styles.cartBadge} aria-label={`${cartQty} en carrito`}>
          {cartQty}
        </span>
      )}

      <span className={styles.category}>{item.category}</span>
      <h3 className={`${styles.name} ${unavailable ? styles.nameStrike : ''}`}>
        {item.name}
      </h3>
      <span className={styles.price}>${item.price}</span>

      {unavailable && item.unavailableReason && (
        <p className={styles.reason}>Sin stock: {item.unavailableReason}</p>
      )}

      {!unavailable && (
        <div className={styles.addBtn} aria-hidden="true">+</div>
      )}
    </div>
  )
}
