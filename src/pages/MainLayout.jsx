import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { useOrderStore } from '../store/orderStore'
import { useAlertStore } from '../store/alertStore'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { menuAPI } from '../services/api'
import { useMenuStore } from '../store/menuStore'
import AlertBanner from '../components/AlertBanner'
import styles from './MainLayout.module.css'

export default function MainLayout() {
  const navigate = useNavigate()
  const { waiter, logout } = useAuthStore()
  const cartCount = useCartStore((s) => s.getItemCount())
  const pendingSync = useOrderStore((s) => s.getPendingCount())
  const syncQueue = useOrderStore((s) => s.syncOfflineQueue)
  const alerts = useAlertStore((s) => s.alerts)
  const isOnline = useOnlineStatus()
  const setItems = useMenuStore((s) => s.setItems)
  const setLoading = useMenuStore((s) => s.setLoading)

  // Cargar menú al iniciar
  useEffect(() => {
    const fetchMenu = async () => {
      setLoading(true)
      try {
        const res = await menuAPI.getMenu()
        setItems(res.data)
      } catch {
        // Offline — el menú puede que ya esté guardado desde la sesión pasada
      } finally {
        setLoading(false)
      }
    }
    fetchMenu()
  }, [setItems, setLoading])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.layout}>
      {/* ── Top bar ── */}
      <header className={styles.topBar}>
        <span className={styles.logo}>
          Gestión de pedidos de un restaurante
        </span>
        <span className={styles.waiterName}>{waiter?.name}</span>

        {/* RNF-06: Offline indicator */}
        {!isOnline && (
          <span className={styles.offlinePill} aria-live="polite">
            Sin conexión
          </span>
        )}

        {/* RNF-07: Pending sync indicator */}
        {pendingSync > 0 && isOnline && (
          <button className={styles.syncPill} onClick={syncQueue}>
            Sincronizar ({pendingSync})
          </button>
        )}

        <button className={styles.logoutBtn} onClick={handleLogout}>
          Salir
        </button>
      </header>

      {/* ── Alert banners (RF-13) ── */}
      <div className={styles.alertArea} aria-live="polite">
        {alerts.map((alert) => (
          <AlertBanner key={alert.id} alert={alert} />
        ))}
      </div>

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div className={styles.offlineBanner}>
          Modo sin conexión — los pedidos se guardan localmente y se sincronizarán al restaurar la red.
        </div>
      )}

      {/* ── Page content ── */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* ── Bottom nav (tablet-optimised) ── */}
      <nav className={styles.bottomNav}>
        <NavLink to="/menu" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
          Menú
        </NavLink>

        <NavLink to="/carrito" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
          <div className={styles.cartWrapper}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
          </div>
          Carrito
        </NavLink>

        <NavLink to="/pedidos" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
          <div className={styles.cartWrapper}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            {pendingSync > 0 && <span className={styles.syncDot} />}
          </div>
          Pedidos
        </NavLink>
      </nav>
    </div>
  )
}
