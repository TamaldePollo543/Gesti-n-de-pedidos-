// RF-01: Mostrar solo ítems disponibles
// RF-02: Exclusión en tiempo real vía WebSocket
// RNF-09: Ítems no disponibles, fondo gris, tachado y candado
import { useMenuStore } from '../store/menuStore'
import { useCartStore } from '../store/cartStore'
import MenuItem from '../components/MenuItem'
import styles from './MenuPage.module.css'

export default function MenuPage() {
  const {
    categories,
    activeCategory,
    searchQuery,
    isLoading,
    error,
    setActiveCategory,
    setSearchQuery,
    getFilteredItems,
  } = useMenuStore()

  const { addItem, items: cartItems } = useCartStore()

  const filteredItems = getFilteredItems()

  const getCartQty = (itemId) =>
    cartItems.find((i) => i.id === itemId)?.qty ?? 0

  if (isLoading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} aria-label="Cargando menú…" />
        <p className={styles.loadingText}>Cargando menú…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.center}>
        <p className={styles.errorText}>No se pudo cargar el menú. Verifica la conexión.</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Search bar */}
      <div className={styles.searchRow}>
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Buscar platillo…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Buscar en el menú"
          />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda">×</button>
          )}
        </div>
      </div>

      {/* Category pills */}
      <div className={styles.catPills} role="tablist" aria-label="Categorías">
        {categories.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            className={`${styles.pill} ${activeCategory === cat ? styles.pillActive : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Menu grid */}
      {filteredItems.length === 0 ? (
        <div className={styles.empty}>
          <p>Sin resultados para "{searchQuery}"</p>
        </div>
      ) : (
        <div className={styles.grid} role="list">
          {filteredItems.map((item) => (
            <MenuItem
              key={item.id}
              item={item}
              cartQty={getCartQty(item.id)}
              onAdd={() => addItem(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
