import type { BankOption } from './api/types'

/** Available channels (subset of MAJA payment methods the venue enables). */
export const COW_BANKS: BankOption[] = [
  { code: 'bni', name: 'BNI', category: 'va' },
  { code: 'mandiri', name: 'Mandiri', category: 'va' },
  { code: 'bri', name: 'BRI', category: 'va' },
  { code: 'bsi', name: 'BSI', category: 'va' },
  { code: 'permata', name: 'Permata', category: 'va' },
  { code: 'bca', name: 'BCA', category: 'va' },
  { code: 'bni-qris', name: 'QRIS', category: 'qris' },
]

export function bankName(code: string): string {
  return COW_BANKS.find((b) => b.code === code)?.name ?? code.toUpperCase()
}
