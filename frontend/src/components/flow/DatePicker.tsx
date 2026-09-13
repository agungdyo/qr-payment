import { useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DatePickerProps {
  onSelect: (date: string) => void
  onBack: () => void
  minDate?: Date
  maxDate?: Date
}

export function DatePicker({ onSelect, onBack, minDate, maxDate }: DatePickerProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewDate, setViewDate] = useState(() => {
    const d = minDate && minDate > today ? minDate : today
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]

  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1))
  }

  const isDateDisabled = (day: number): boolean => {
    const date = new Date(year, month, day)
    const min = minDate || today
    const max = maxDate || new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000) // max 30 days

    date.setHours(0, 0, 0, 0)
    min.setHours(0, 0, 0, 0)
    max.setHours(0, 0, 0, 0)

    return date < min || date > max
  }

  const isToday = (day: number): boolean => {
    return (
      year === today.getFullYear() &&
      month === today.getMonth() &&
      day === today.getDate()
    )
  }

  const handleDateClick = (day: number) => {
    if (isDateDisabled(day)) return
    const date = new Date(year, month, day)
    setSelectedDate(date)
  }

  const handleConfirm = () => {
    if (!selectedDate) return
    const isoDate = selectedDate.toISOString().split('T')[0]
    onSelect(isoDate)
  }

  const days: (number | null)[] = []
  // Add empty slots for days before the 1st
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null)
  }
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-zinc-500 active:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Kembali
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg p-2 text-zinc-400 active:bg-zinc-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="text-base font-semibold text-zinc-900">
            {monthNames[month]} {year}
          </h3>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-lg p-2 text-zinc-400 active:bg-zinc-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Day names */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {dayNames.map((name) => (
            <div
              key={name}
              className="text-center text-xs font-medium text-zinc-400"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="aspect-square" />
            }

            const disabled = isDateDisabled(day)
            const todayMark = isToday(day)
            const selected =
              selectedDate &&
              selectedDate.getFullYear() === year &&
              selectedDate.getMonth() === month &&
              selectedDate.getDate() === day

            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => handleDateClick(day)}
                className={cn(
                  'aspect-square flex items-center justify-center rounded-full text-sm transition',
                  disabled && 'text-zinc-300 cursor-not-allowed',
                  !disabled && !selected && 'text-zinc-700 hover:bg-zinc-100',
                  selected && 'bg-zinc-900 text-white font-semibold',
                  todayMark && !selected && 'ring-2 ring-zinc-300 ring-inset',
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected date display */}
      {selectedDate && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <Calendar className="h-4 w-4 text-zinc-400" />
          <span className="text-sm text-zinc-700">
            {selectedDate.toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>
      )}

      {/* Confirm button */}
      <button
        type="button"
        disabled={!selectedDate}
        onClick={handleConfirm}
        className={cn(
          'w-full rounded-xl py-3 text-sm font-semibold transition',
          selectedDate
            ? 'bg-zinc-900 text-white active:bg-zinc-700'
            : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
        )}
      >
        Pilih Tanggal
      </button>
    </div>
  )
}
