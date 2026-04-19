import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { connectRealtime, disconnectRealtime } from './services/realtime'
import LoginPage from './pages/LoginPage'
import MainLayout from './pages/MainLayout'
import MenuPage from './pages/MenuPage'
import CartPage from './pages/CartPage'
import OrdersPage from './pages/OrdersPage'
import KitchenPage from './pages/KitchenPage'
import { canManageKitchen } from './utils/roles'

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const waiter = useAuthStore((s) => s.waiter)
  const defaultPath = canManageKitchen(waiter?.role) ? '/cocina' : '/menu'

  useEffect(() => {
    if (isAuthenticated) {
      connectRealtime()
    }
    return () => disconnectRealtime()
  }, [isAuthenticated])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={defaultPath} replace />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="carrito" element={<CartPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
        <Route path="cocina" element={<KitchenPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
