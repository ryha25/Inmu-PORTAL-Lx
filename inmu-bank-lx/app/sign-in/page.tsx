import { AuthForm } from '@/components/auth-form'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function SignInPage() {
  const session = await getSession()
  if (session?.user) redirect('/')
  return <AuthForm mode="sign-in" />
}
