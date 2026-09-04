import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/cn'

interface InstructionsProps {
  bankName: string
  va: string
  totalText: string
}

interface Channel {
  label: string
  steps: string[]
}

function buildChannels(bankName: string, va: string, totalText: string): Channel[] {
  return [
    {
      label: `via Mobile Banking ${bankName}`,
      steps: [
        `Buka aplikasi mobile banking ${bankName}`,
        'Pilih menu Transfer › Virtual Account',
        `Masukkan nomor VA: ${va}`,
        `Masukkan nominal ${totalText} (tepat)`,
        'Konfirmasi dan masukkan PIN / autentikasi',
      ],
    },
    {
      label: 'via ATM',
      steps: [
        'Masukkan kartu dan PIN di ATM mana pun',
        'Pilih Transfer › Ke rekening bank lain',
        `Pilih bank ${bankName} (Virtual Account)`,
        `Masukkan nomor VA: ${va}`,
        `Masukkan nominal ${totalText} (tepat)`,
        'Konfirmasi dan selesaikan transaksi',
      ],
    },
    {
      label: 'via Internet Banking',
      steps: [
        'Login ke internet banking Anda',
        'Pilih Transfer › Virtual Account',
        `Masukkan nomor VA: ${va}`,
        `Masukkan nominal ${totalText} (tepat)`,
        'Konfirmasi dengan m-token / SMS',
      ],
    },
  ]
}

export function Instructions({ bankName, va, totalText }: InstructionsProps) {
  const [openIndex, setOpenIndex] = useState(0)
  const channels = buildChannels(bankName, va, totalText)

  return (
    <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
      {channels.map((channel, index) => {
        const open = openIndex === index
        return (
          <div key={channel.label}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenIndex(open ? -1 : index)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-zinc-800"
            >
              {channel.label}
              <ChevronDown
                className={cn('h-4 w-4 text-zinc-400 transition-transform', open && 'rotate-180')}
                aria-hidden
              />
            </button>
            {open && (
              <ol className="list-decimal space-y-1.5 px-4 pb-3 pl-8 text-sm text-zinc-600">
                {channel.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
                {index === 0 && (
                  <li className="pt-1 text-xs italic text-zinc-400">
                    Contoh langkah — sesuaikan dengan instruksi resmi {bankName} saat
                    integrasi.
                  </li>
                )}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}
