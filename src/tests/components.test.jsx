import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MenuItem from '../components/MenuItem'
import AlertBanner from '../components/AlertBanner'

// ── MenuItem ─────────────────────────────────────────────────────────────────
describe('MenuItem', () => {
  const availItem = { id: 1, name: 'Tacos de birria', category: 'Tacos', price: 85, available: true }
  const unavailItem = { ...availItem, available: false }

  it('renders item name and price', () => {
    render(<MenuItem item={availItem} cartQty={0} onAdd={vi.fn()} />)
    expect(screen.getByText('Tacos de birria')).toBeInTheDocument()
    expect(screen.getByText('$85')).toBeInTheDocument()
  })

  it('calls onAdd when available item is clicked (RF-03)', () => {
    const onAdd = vi.fn()
    render(<MenuItem item={availItem} cartQty={0} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('listitem'))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onAdd when unavailable item is clicked (RF-01)', () => {
    const onAdd = vi.fn()
    render(<MenuItem item={unavailItem} cartQty={0} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('listitem'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('shows Agotado badge for unavailable items (RNF-09)', () => {
    render(<MenuItem item={unavailItem} cartQty={0} onAdd={vi.fn()} />)
    expect(screen.getByText(/agotado/i)).toBeInTheDocument()
  })

  it('shows cart quantity badge when in cart', () => {
    render(<MenuItem item={availItem} cartQty={3} onAdd={vi.fn()} />)
    expect(screen.getByLabelText(/3 en carrito/i)).toBeInTheDocument()
  })

  it('has aria-disabled true for unavailable items (accessibility)', () => {
    render(<MenuItem item={unavailItem} cartQty={0} onAdd={vi.fn()} />)
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-disabled', 'true')
  })

  it('responds to keyboard Enter for available items', () => {
    const onAdd = vi.fn()
    render(<MenuItem item={availItem} cartQty={0} onAdd={onAdd} />)
    fireEvent.keyDown(screen.getByRole('listitem'), { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})

// ── AlertBanner ───────────────────────────────────────────────────────────────
vi.mock('../store/alertStore', () => ({
  useAlertStore: (sel) => sel({ alerts: [], removeAlert: vi.fn(), addAlert: vi.fn(), clearAll: vi.fn() }),
}))

describe('AlertBanner', () => {
  it('renders alert message', () => {
    const alert = { id: 1, type: 'conflict', message: 'El ítem X fue agotado' }
    const removeAlert = vi.fn()
    // Modificar la tienda para esta prueba
    vi.doMock('../store/alertStore', () => ({
      useAlertStore: (sel) => sel({ removeAlert }),
    }))
    render(<AlertBanner alert={alert} />)
    expect(screen.getByText('El ítem X fue agotado')).toBeInTheDocument()
  })

  it('renders close button', () => {
    const alert = { id: 2, type: 'exclusion', message: 'Platillo agotado' }
    render(<AlertBanner alert={alert} />)
    expect(screen.getByLabelText('Cerrar')).toBeInTheDocument()
  })

  it('has role="alert" for accessibility', () => {
    const alert = { id: 3, type: 'success', message: 'Pedido listo' }
    render(<AlertBanner alert={alert} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
