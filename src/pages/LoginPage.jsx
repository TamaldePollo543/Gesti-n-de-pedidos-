import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import styles from './LoginPage.module.css'

function normalizeAuthPayload(payload, fallbackEmail) {
  const raw = payload?.data ?? payload
  const token = raw?.token?.access_token || raw?.token || raw?.access_token
  const user = raw?.user || raw?.waiter || {}
  const fallbackName = (fallbackEmail || '')
    .split('@')[0]
    .split('.')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return {
    token,
    waiter: {
      id: user.id || user.user_id || user.uid || user.waiter_id,
      name: user.name || user.full_name || fallbackName,
      role: user.role || 'waiter',
    },
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await authAPI.login({ email, password })
      const { token, waiter } = normalizeAuthPayload(res.data, email)

      if (!token || !waiter?.id) {
        throw new Error('Respuesta de autenticacion invalida')
      }

      login(token, waiter)
      navigate('/menu', { replace: true })
    } catch (err) {
      let msg = 'Credenciales incorrectas'
      if (err.response?.status === 401) msg = 'Correo o contrasena invalidos.'
      if (err.response?.status === 403) msg = 'No tienes permisos para acceder.'
      if (err.response?.status >= 500) msg = 'Servicio no disponible. Intenta de nuevo.'
      if (err.message === 'Respuesta de autenticacion invalida') msg = err.message

      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.brand}>
        <span className={styles.brandName}>Gestión de pedidos de un restaurante</span>
        <p className={styles.brandSub}>Sistema de pedidos · Módulo Mesero</p>
      </div>

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <h1 className={styles.heading}>Iniciar sesión</h1>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        <label className={styles.label} htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          className={styles.input}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="juan.perez@restaurante.com"
          required
        />

        <label className={styles.label} htmlFor="password">Contraseña</label>
        <input
          id="password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        <button
          className={styles.submitBtn}
          type="submit"
          disabled={loading || !email || !password}
        >
          {loading ? 'Verificando…' : 'Ingresar'}
        </button>

        <p className={styles.hint}>
          Solo meseros autorizados por la API central.
        </p>
      </form>
    </div>
  )
}
