import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { connectSocket, disconnectSocket } from './services/socket'
import LoginPage from './pages/LoginPage'
import MainLayout from './pages/MainLayout'
import MenuPage from './pages/MenuPage'
import CartPage from './pages/CartPage'
import OrdersPage from './pages/OrdersPage'

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket()
    }
    return () => disconnectSocket()
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
        <Route index element={<Navigate to="/menu" replace />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="carrito" element={<CartPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
