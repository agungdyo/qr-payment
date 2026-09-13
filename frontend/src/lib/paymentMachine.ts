import type { Payment, Workspace } from './api/types'

/**
 * Page-level state machine
 */

export type Phase =
  | 'loading'
  | 'notfound'
  | 'choice'
  | 'scheduleType'
  | 'datePicker'
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
  bookingDate: string | null
  userChoice: 'makan' | 'meja' | null
}

export type FlowAction =
  | { type: 'reset' }
  | { type: 'loaded'; workspace: Workspace }
  | { type: 'resumed'; payment: Payment }
  | { type: 'loadFailed' }
  | { type: 'setHours'; hours: number }
  | { type: 'setBank'; bankCode: string }
  | { type: 'setUserChoice'; choice: 'makan' | 'meja' }
  | { type: 'setScheduleType'; scheduleType: 'today' | 'other' }
  | { type: 'setBookingDate'; date: string }
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
    phase: 'choice',
    workspace: null,
    hours: 1,
    bankCode: null,
    payment: null,
    errorMessage: null,
    cancelledAt: null,
    bookingDate: null,
    userChoice: null,
  }
}

export function paymentReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'reset':
      return initialState()
    case 'setUserChoice':
      return { ...state, userChoice: action.choice, phase: 'scheduleType' }
    case 'setScheduleType':
      if (action.scheduleType === 'today') {
        const firstTier = state.workspace?.tiers[0]
        return { ...state, phase: 'select', hours: firstTier ? firstTier.durationHours : 1, bookingDate: null }
      }
      return { ...state, phase: 'datePicker' }
    case 'setBookingDate': {
      const firstTier = state.workspace?.tiers[0]
      return { ...state, phase: 'select', bookingDate: action.date, hours: firstTier ? firstTier.durationHours : 1 }
    }
    case 'loaded': {
      const firstTier = action.workspace.tiers[0]
      return { ...state, phase: 'choice', workspace: action.workspace, hours: firstTier ? firstTier.durationHours : 1 }
    }
    case 'resumed':
      // When resuming an open payment, preserve the existing state
      return { ...state, phase: 'va', payment: action.payment }
    case 'loadFailed':
      return { ...state, phase: 'notfound' }
    case 'setHours':
      return { ...state, hours: action.hours }
    case 'setBank':
      return { ...state, bankCode: action.bankCode }
    case 'registerStart':
      return { ...state, phase: 'registering', errorMessage: null }
    case 'registerSuccess':
      return { ...state, phase: 'va', payment: action.payment }
    case 'registerError':
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'polled': {
      const p = action.payment
      if (p.status === 'paid') return { ...state, phase: 'paid', payment: p }
      if (p.status === 'cancelled') return { ...state, phase: 'cancelled', payment: p, cancelledAt: new Date().toISOString() }
      return { ...state, payment: p }
    }
    case 'paid':
      return { ...state, phase: 'paid', payment: action.payment }
    case 'expired':
      if (state.phase !== 'va') return state
      return { ...state, phase: 'expired' }
    case 'cancelSuccess':
      return { ...state, phase: 'cancelled', cancelledAt: action.at, ...(state.payment ? { payment: { ...state.payment, status: 'cancelled' as const } } : {}) }
    case 'startOver':
      return { ...state, phase: 'choice', payment: null, errorMessage: null, cancelledAt: null, bookingDate: null, userChoice: null }
    default:
      return state
  }
}
