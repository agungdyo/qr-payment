import type { BillingMode, Payment, Workspace } from './api/types'
import { defaultSelection } from './pricing'

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
  billingMode: BillingMode
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
  | { type: 'setBillingMode'; mode: BillingMode }
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
    billingMode: 'duration',
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
    case 'setScheduleType': {
      if (action.scheduleType === 'today') {
        const hours =
          state.billingMode === 'duration' && state.workspace
            ? defaultSelection(state.workspace).hours
            : state.hours
        return { ...state, phase: 'select', hours, bookingDate: null }
      }
      return { ...state, phase: 'datePicker' }
    }
    case 'setBookingDate': {
      const hours =
        state.billingMode === 'duration' && state.workspace
          ? defaultSelection(state.workspace).hours
          : state.hours
      return { ...state, phase: 'select', bookingDate: action.date, hours }
    }
    case 'loaded': {
      const selection = defaultSelection(action.workspace)
      return {
        ...state,
        phase: 'choice',
        workspace: action.workspace,
        billingMode: selection.mode,
        hours: selection.hours,
      }
    }
    case 'resumed':
      return {
        ...state,
        phase: 'va',
        payment: action.payment,
        billingMode: action.payment.billingMode,
        hours: action.payment.hours,
      }
    case 'loadFailed':
      return { ...state, phase: 'notfound' }
    case 'setBillingMode': {
      const hours =
        action.mode === 'duration' &&
        state.workspace &&
        !state.workspace.tiers.some((t) => t.durationHours === state.hours)
          ? defaultSelection(state.workspace).hours
          : state.hours
      return { ...state, billingMode: action.mode, hours }
    }
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
