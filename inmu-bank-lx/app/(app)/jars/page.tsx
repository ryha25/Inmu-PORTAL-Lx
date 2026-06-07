import { PageHeader } from '@/components/page-header'
import { getJars } from '@/app/actions/data'
import { JarView } from '@/components/jar-view'

export default async function JarsPage() {
  const jars = await getJars()
  const serialized = jars.map((j) => ({
    ...j,
    balance: String(j.balance),
    lockStart: j.lockStart?.toISOString() ?? null,
    unlockDate: j.unlockDate?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="jars_title" />
      <JarView jars={serialized} />
    </div>
  )
}
