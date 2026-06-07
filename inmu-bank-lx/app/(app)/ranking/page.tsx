import { PageHeader } from '@/components/page-header'
import { getRanking } from '@/app/actions/data'
import { RankingView } from '@/components/ranking-view'

export default async function RankingPage() {
  const rows = await getRanking()
  return (
    <div>
      <PageHeader titleKey="ranking_title" />
      <RankingView rows={rows} />
    </div>
  )
}
