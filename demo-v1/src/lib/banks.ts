import type { BankOption } from './api/types'

/** Available VA channels (subset of MAJA payment methods the venue enables). */
export const COW_BANKS: BankOption[] = [
  { code: 'bni', name: 'BNI' },
  { code: 'bca', name: 'BCA' },
  { code: 'mandiri', name: 'Mandiri' },
  { code: 'bri', name: 'BRI' },
  { code: 'bsi', name: 'BSI' },
  { code: 'permata', name: 'Permata' },
]

export function bankName(code: string): string {
  return COW_BANKS.find((b) => b.code === code)?.name ?? code.toUpperCase()
}
