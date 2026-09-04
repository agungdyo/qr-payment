import { Landmark } from 'lucide-react'

import type { BankOption } from '@/lib/api/types'
import { cn } from '@/lib/cn'

interface BankGridProps {
  banks: BankOption[]
  selected: string | null
  onSelect: (code: string) => void
}

export function BankGrid({ banks, selected, onSelect }: BankGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {banks.map((bank) => {
        const isSelected = selected === bank.code
        return (
          <button
            key={bank.code}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(bank.code)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition',
              isSelected
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-800 active:bg-zinc-50',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                isSelected ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-500',
              )}
            >
              <Landmark className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm font-medium">{bank.name}</span>
          </button>
        )
      })}
    </div>
  )
}
