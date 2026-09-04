import type { ReactNode } from 'react'

/** Mobile-first shell: full width on phones, phone-like column on desktop. */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-200">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white shadow-2xl">
        {children}
      </div>
    </div>
  )
}
