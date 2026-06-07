import { PageHeader } from '@/components/page-header'
import { TransactionTable } from '@/components/transaction-table'
import { getTransactions } from '@/app/actions/data'

export default async function HistoryPage() {
  const rows = await getTransactions()
  const serialized = rows.map((r) => ({
    ...r,
    amount: String(r.amount),
    createdAt: r.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="nav_history" />
      <TransactionTable rows={serialized} filename="inmu-history.csv" />
    </div>
  )
}
