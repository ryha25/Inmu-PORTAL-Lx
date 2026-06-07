'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TxTypeBadge, isOutgoing } from '@/components/tx-type-badge'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatInmu } from '@/lib/format'
import { useI18n } from '@/lib/i18n/context'
import { dict } from '@/lib/i18n/dict'
import { cn } from '@/lib/utils'
import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

export type TxRow = {
  id: number
  type: string
  amount: string
  category: string | null
  counterparty: string | null
  memo: string | null
  createdAt: string
}

const TYPE_OPTIONS = [
  'all',
  'deposit',
  'withdraw',
  'send',
  'receive',
  'reward',
  'airdrop',
]

export function TransactionTable({
  rows,
  showTypeFilter = true,
  filename = 'inmu-transactions.csv',
}: {
  rows: TxRow[]
  showTypeFilter?: boolean
  filename?: string
}) {
  const { t, locale } = useI18n()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')

  const filtered = useMemo(() => {
    let r = rows
    if (type !== 'all') r = r.filter((x) => x.type === type)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(
        (x) =>
          x.memo?.toLowerCase().includes(q) ||
          x.counterparty?.toLowerCase().includes(q) ||
          x.category?.toLowerCase().includes(q),
      )
    }
    return r
  }, [rows, search, type])

  function handleExport() {
    // NOTE: user CSV never includes SOL wallet — only tx data.
    const header = [
      dict[locale].date,
      dict[locale].type,
      dict[locale].amount,
      dict[locale].counterparty,
      dict[locale].memo,
    ]
    const body = filtered.map((x) => [
      formatDate(x.createdAt, locale),
      dict[locale][`type_${x.type}` as keyof (typeof dict)['ja']] ?? x.type,
      `${isOutgoing(x.type) ? '-' : '+'}${x.amount}`,
      x.counterparty ?? '',
      x.memo ?? '',
    ])
    downloadCsv(filename, [header, ...body])
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            className="min-h-11 pl-9 text-base"
          />
        </div>
        {showTypeFilter && (
          <Select value={type} onValueChange={(v) => setType(v ?? 'all')}>
            <SelectTrigger className="min-h-11 sm:w-40">
              <SelectValue placeholder={t('filter')} />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt === 'all'
                    ? t('all')
                    : t(`type_${opt}` as keyof (typeof dict)['ja'])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          onClick={handleExport}
          className="min-h-11 gap-2"
        >
          <Download className="size-4" />
          {t('export_csv')}
        </Button>
      </div>

      <Card className="border-border bg-card">
        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {t('no_data')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((tx) => {
              const out = isOutgoing(tx.type)
              return (
                <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TxTypeBadge type={tx.type} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(tx.createdAt, locale)}
                      </span>
                    </div>
                    {(tx.counterparty || tx.memo) && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[tx.counterparty, tx.memo]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <p
                    className={cn(
                      'shrink-0 font-mono text-sm font-bold tabular-nums',
                      out ? 'text-destructive' : 'text-chart-5',
                    )}
                  >
                    {out ? '-' : '+'}
                    {formatInmu(tx.amount)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <p className="text-center text-[11px] text-muted-foreground">
        {filtered.length} {locale === 'ja' ? '件' : 'records'}
      </p>
    </div>
  )
}
