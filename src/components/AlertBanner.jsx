import { useAlertStore } from '../store/alertStore'
import styles from './AlertBanner.module.css'

const ICONS = {
  exclusion: '⚠',
  conflict:  '🚨',
  success:   '✓',
  warning:   '⚠',
  info:      'ℹ',
}

export default function AlertBanner({ alert }) {
  const removeAlert = useAlertStore((s) => s.removeAlert)
  return (
    <div className={`${styles.banner} ${styles[alert.type] || styles.info}`} role="alert">
      <span className={styles.icon}>{ICONS[alert.type] || 'ℹ'}</span>
      <span className={styles.message}>{alert.message}</span>
      <button className={styles.close} onClick={() => removeAlert(alert.id)} aria-label="Cerrar">×</button>
    </div>
  )
}
