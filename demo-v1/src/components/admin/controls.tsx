import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/lib/cn'

export const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-100 disabled:text-zinc-400'

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-zinc-400">{hint}</span>}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return <input {...rest} className={cn(inputCls, className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props
  return <select {...rest} className={cn(inputCls, className)} />
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return <input type="number" {...rest} className={cn(inputCls, className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props
  return <textarea {...rest} className={cn(inputCls, 'min-h-20 resize-y', className)} />
}

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger'

export function Button({
  variant = 'primary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-300 disabled:text-zinc-500',
    outline:
      'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 disabled:text-zinc-300',
    ghost: 'text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300',
    danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
  }
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
    />
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-emerald-500' : 'bg-zinc-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-zinc-200 bg-white', className)}>
      {children}
    </div>
  )
}
