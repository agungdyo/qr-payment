import { Loader2, Zap } from 'lucide-react'

interface DemoPanelProps {
  busy: boolean
  onMarkPaid: () => void
}

/** Developer-only: simulates MAJA's payment notification webhook. */
export function DemoPanel({ busy, onMarkPaid }: DemoPanelProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 py-1.5 pl-3 pr-1.5 text-white shadow-lg">
        <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden />
        <span className="text-xs font-medium text-zinc-300">Demo</span>
        <button
          type="button"
          disabled={busy}
          onClick={onMarkPaid}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 active:bg-emerald-400 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          Webhook: tandai lunas
        </button>
      </div>
    </div>
  )
}
