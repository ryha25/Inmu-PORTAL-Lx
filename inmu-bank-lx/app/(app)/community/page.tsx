import { PageHeader } from '@/components/page-header'
import { getCommunityStats } from '@/app/actions/data'
import { CommunityView } from '@/components/community-view'

export default async function CommunityPage() {
  const stats = await getCommunityStats()
  return (
    <div>
      <PageHeader titleKey="community_title" />
      <CommunityView stats={stats} />
    </div>
  )
}
