import { PageHeader } from '@/components/page-header'
import { TransactionTable } from '@/components/transaction-table'
import { BalanceSummary } from '@/components/balance-summary'
import { ensureProfile } from '@/app/actions/auth-helpers'
import { getDashboard, getTransactions } from '@/app/actions/data'

export default async function BalancePage() {
  const profile = await ensureProfile()
  const dash = await getDashboard()
  const rows = await getTransactions()
  const serialized = rows.map((r) => ({
    ...r,
    amount: String(r.amount),
    createdAt: r.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="nav_balance" />
      <div className="flex flex-col gap-5">
        <BalanceSummary
          balance={Number(profile.balance)}
          totalReceived={dash.totalReceived}
          totalSent={dash.totalSent}
        />
        <TransactionTable rows={serialized} filename="inmu-balance-history.csv" />
      </div>
    </div>
  )
}
