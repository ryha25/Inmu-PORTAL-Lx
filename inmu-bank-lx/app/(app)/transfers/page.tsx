import { PageHeader } from '@/components/page-header'
import { TransactionTable } from '@/components/transaction-table'
import { getTransfers } from '@/app/actions/data'

export default async function TransfersPage() {
  const rows = await getTransfers()
  const serialized = rows.map((r) => ({
    ...r,
    amount: String(r.amount),
    createdAt: r.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="nav_transfers" />
      <TransactionTable
        rows={serialized}
        showTypeFilter
        filename="inmu-transfers.csv"
      />
    </div>
  )
}
