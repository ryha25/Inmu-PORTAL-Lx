export function formatInmu(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '0'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(n)
}

export function maskWallet(addr?: string | null): string {
  if (!addr) return '—'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export function formatDate(d: Date | string, locale: 'ja' | 'en' = 'ja') {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export const TX_INCOME_TYPES = ['deposit', 'receive', 'reward', 'airdrop']
export const TX_OUTGOING_TYPES = ['withdraw', 'send']

export function txSign(type: string): 1 | -1 {
  return TX_OUTGOING_TYPES.includes(type) ? -1 : 1
}
