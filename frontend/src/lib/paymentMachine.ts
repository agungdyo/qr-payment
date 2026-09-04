import type { Payment, Workspace } from './api/types'

/**
 * Page-level state machine — a projection of the booking/payment machines
 * from ../docs/state-machine.md. The UI never mutates truth directly; it
 * dispatches intents and the reducer advances the phase.
 *
 *   loading → select → registering → va → paid
 *                          ▲          │
 *                          │          ├─→ expired ──→ (Buat VA baru) → registering
 *                          │          │        └────→ (Batalkan) → cancelled
 *                          │          └─→ cancelled (dibatalkan / perangkat lain)
 *                          │
 *     loading → notfound / error → select (retry)
 */

export type Phase =
  | 'loading'
  | 'notfound'
  | 'select'
  | 'registering'
  | 'va'
  | 'paid'
  | 'expired'
  | 'cancelled'
  | 'error'

export interface FlowState {
  phase: Phase
  workspace: Workspace | null
  hours: number
  bankCode: string | null
  payment: Payment | null
  errorMessage: string | null
  cancelledAt: string | null
}

export type FlowAction =
  | { type: 'reset' }
  | { type: 'loaded'; workspace: Workspace }
  | { type: 'resumed'; payment: Payment }
  | { type: 'loadFailed' }
  | { type: 'setHours'; hours: number }
  | { type: 'setBank'; bankCode: string }
  | { type: 'registerStart' }
  | { type: 'registerSuccess'; payment: Payment }
  | { type: 'registerError'; message: string }
  | { type: 'polled'; payment: Payment }
  | { type: 'paid'; payment: Payment }
  | { type: 'expired' }
  | { type: 'cancelSuccess'; at: string }
  | { type: 'startOver' }

export function initialState(): FlowState {
  return {
    phase: 'loading',
    workspace: null,
    hours: 1,
    bankCode: null,
    payment: null,
    errorMessage: null,
    cancelledAt: null,
  }
}

export function paymentReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'reset':
      return initialState()

    case 'loaded': {
      const firstTier = action.workspace.tiers[0]
      return {
        ...state,
        phase: 'select',
        workspace: action.workspace,
        hours: firstTier ? firstTier.durationHours : 1,
      }
    }

    case 'resumed':
      return { ...state, phase: 'va', payment: action.payment }

    case 'loadFailed':
      return { ...state, phase: 'notfound' }

    case 'setHours':
      return { ...state, hours: action.hours }

    case 'setBank':
      return { ...state, bankCode: action.bankCode }

    case 'registerStart':
      if (state.phase !== 'select' && state.phase !== 'expired') return state
      return { ...state, phase: 'registering', errorMessage: null }

    case 'registerSuccess':
      return { ...state, phase: 'va', payment: action.payment }

    case 'registerError':
      return { ...state, phase: 'error', errorMessage: action.message }

    case 'polled': {
      const p = action.payment
      if (p.status === 'paid') {
        return { ...state, phase: 'paid', payment: p }
      }
      if (p.status === 'cancelled') {
        return {
          ...state,
          phase: 'cancelled',
          payment: p,
          cancelledAt: new Date().toISOString(),
        }
      }
      return { ...state, payment: p }
    }

    case 'paid':
      return { ...state, phase: 'paid', payment: action.payment }

    case 'expired':
      if (state.phase !== 'va') return state
      return { ...state, phase: 'expired' }

    case 'cancelSuccess':
      return {
        ...state,
        phase: 'cancelled',
        cancelledAt: action.at,
        ...(state.payment ? { payment: { ...state.payment, status: 'cancelled' as const } } : {}),
      }

    case 'startOver':
      return {
        ...state,
        phase: 'select',
        payment: null,
        errorMessage: null,
        cancelledAt: null,
      }

    default:
      return state
  }
}
