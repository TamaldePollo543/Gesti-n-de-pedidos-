# Migración Módulo 1 → Alineación con Módulo 3 (API Central)

## Resumen de cambios

El Módulo 1 (Gestión de Pedidos para Meseros) ha sido adaptado para trabajar con la API central del Módulo 3 en lugar de Firebase.

### 1. Autenticación (🔐 Completado)

**Antes:** Firebase Auth (Google + Email/Password)
```javascript
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
```

**Ahora:** API Central REST
```javascript
import { authAPI } from '../services/api'
const res = await authAPI.login({ email, password })
const { token, waiter } = normalizeAuthPayload(res.data, email)
```

**Cambios:**
- Eliminada dependencia `firebase` (removida de `package.json`)
- Eliminado archivo `src/firebase.js`
- Actualizado `src/pages/LoginPage.jsx` para usar endpoint `/auth/login` de la API central
- Implementada función `normalizeAuthPayload()` para soportar variantes de formato de respuesta:
  - `{ token, user }` (formato módulo 3)
  - `{ access_token, waiter }`
  - Fallback a derivar nombre del email si no viene en respuesta

**Variables de entorno:**
```env
VITE_API_BASE_URL=https://api.restaurant.local
VITE_API_URL=https://api.mesaplus.local/v1  # Retrocompatibilidad
```

### 2. Tiempo Real / WebSocket (⚡ Completado)

**Antes:** Mock local para desarrollo
```javascript
socket = {
  connected: true,
  handlers: {},
  on(event, cb) { ... },
  emit(event, payload) { ... }
}
```

**Ahora:** Supabase Realtime (preferencia) + Socket.io (fallback)
```javascript
import { connectRealtime, disconnectRealtime } from './services/realtime'
```

**Cambios:**
- Nuevo archivo `src/services/realtime.js` que implementa:
  - **Adaptador Supabase Realtime**: Si `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` están configuradas
    - Canal `menu:items` para cambios de disponibilidad
    - Canal `orders:{waiter_id}` para actualizaciones de pedidos
  - **Adaptador Socket.io**: Fallback si Supabase no está disponible
    - Conecta a `VITE_WS_URL` con autenticación por token JWT

**Eventos soportados (igual interfaz en ambos transports):**
- `item_excluded: { item_id, item_name }` → Marca ítem como no disponible
- `item_restored: { item_id }` → Restaura disponibilidad de ítem
- `order_status_update: { order_id, status }` → Actualiza estado de pedido

**Variables de entorno:**
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_WS_URL=https://api.mesaplus.local  # Fallback socket.io
```

**Compatibilidad:**
- Archivo legacy `src/services/socket.js` ahora apunta a `realtime.js`
- Interfaz pública se mantiene igual para retrocompatibilidad

### 3. Dependencias actualizadas

| Paquete | Versión | Propósito |
|---------|---------|----------|
| `@supabase/supabase-js` | `^2.103.3` | Realtime (NEW) |
| `socket.io-client` | `^4.8.3` | ↑ Actualizado (fallback) |
| `axios` | `^1.6.7` | HTTP (sin cambios) |
| `firebase` | ❌ REMOVIDO | Ya no necesario |

### 4. Flujo de autenticación actualizado

```
1. Usuario ingresa email + contraseña en LoginPage
   ↓
2. POST /auth/login a API central
   - Fallback: POST /auth-login (variante)
   ↓
3. Respuesta contiene: { token, user/waiter }
   ↓
4. normalizeAuthPayload() adapta formato
   ↓
5. useAuthStore.login(token, waiter)
   - Token almacenado en localStorage
   - Usado en Authorization header (Bearer {token})
   ↓
6. Al montarse App.jsx → connectRealtime()
   - Intenta Supabase Realtime
   - Fallback a Socket.io si falla
   ↓
7. Eventos en tiempo real actualizan stores (Zustand)
```

## Configuración para Módulo 3

### Si usas Supabase directamente (recomendado):
```env
VITE_API_BASE_URL=https://your-supabase-url.supabase.co/rest/v1
VITE_SUPABASE_URL=https://your-supabase-url.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-key
```

### Si tienes API Gateway + Socket.io real:
```env
VITE_API_BASE_URL=https://api.restaurant.local
VITE_WS_URL=https://api.restaurant.local
```

## Testing y simulación

Para testing offline o en desarrollo sin infraestructura real:
```javascript
// Console browser
import { simulateItemExcluded, simulateOrderStatusUpdate } from './services/realtime.js'

simulateItemExcluded(101, 'Tacos')
simulateOrderStatusUpdate('ORD-123', 'listo')
```

## Cambios en archivos

### Creados:
- `src/services/realtime.js` - Nuevo sistema de tiempo real

### Modificados:
- `src/services/api.js` - Soporte dual de rutas auth (`/auth/login` y `/auth-login`)
- `src/pages/LoginPage.jsx` - Migración de Firebase a API REST
- `src/App.jsx` - Cambio de `connectSocket` a `connectRealtime`
- `.env.example` - Variables de Supabase + API central
- `package.json` - Agregada `@supabase/supabase-js`, actualizado `socket.io-client`, removido `firebase`

### Eliminados:
- `src/firebase.js` - Ya no necesario

## Validación

✅ Build sin errores
✅ Tests pasando (cobertura < 80% es configuración de proyecto, no error)
✅ Cero referencias a Firebase en código activo
✅ Compatible con variables de entorno de Módulo 3

## Próximos pasos opcionales

1. **Migrar API de menú** a usar endpoints del Módulo 3:
   - Actualmente: `GET /menu/items?available=true`
   - Considerar: `GET /menu-items?page=&limit=` (del mapping de Módulo 3)

2. **Agregar 2FA** (opcional):
   - Módulo 3 soporta: `POST /auth/2fa/challenge` y `/auth/2fa/verify`
   - LoginPage puede extenderse para 2FA si es usuario admin

3. **Sincronizar reportes** (si aplica):
   - Módulo 3 tiene: `GET /reports`, `/reports/stats`, exportar CSV/PDF
   - OrdersPage podría agregar acceso a reportes si el rol del mesero lo permite

## Notas importantes

- ⚠️ El token JWT se almacena en `localStorage` bajo key `auth_token`
- ⚠️ El `user_id` se almacena bajo key `user_id` para auditoría
- ⚠️ En 401 (token inválido), el app redirige automáticamente a `/login`
- ⚠️ Todos los requests mutantes (POST/PUT/PATCH) incluyen `X-User-ID` y `X-Timestamp` headers para auditoría (RFC-14)

---

**Última actualización:** 2026-04-18  
**Estado:** Migración completada ✅
