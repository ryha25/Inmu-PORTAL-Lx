import { PageHeader } from '@/components/page-header'
import { getMyProfile } from '@/app/actions/data'
import { ProfileView } from '@/components/profile-view'

export default async function ProfilePage() {
  const profile = await getMyProfile()
  const serialized = {
    ...profile,
    balance: String(profile.balance),
    savingsBalance: String(profile.savingsBalance),
    totalReceived: String(profile.totalReceived),
    totalSent: String(profile.totalSent),
    monthlyPoints: String(profile.monthlyPoints),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }
  return (
    <div>
      <PageHeader titleKey="profile_title" />
      <ProfileView profile={serialized} />
    </div>
  )
}
