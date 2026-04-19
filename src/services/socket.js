// DEPRECATED: Usar services/realtime.js en su lugar
// Este archivo se mantiene solo para compatibilidad retroactiva
import { connectRealtime as connect, disconnectRealtime as disconnect, getRealtimeClient } from './realtime'

export const connectSocket = connect
export const disconnectSocket = disconnect
export const getSocket = getRealtimeClient

