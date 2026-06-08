import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LangToggle } from '@/components/lang-toggle'
import { Logo } from '@/components/logo'
import { useI18n } from '@/lib/i18n/context'
import { useState } from 'react'
import { toast } from 'sonner'
import { Link, useLocation } from 'wouter'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { t } = useI18n()
  const [, navigate] = useLocation()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'sign-up') {
        const res = await fetch('/api/auth/sign-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, password, passcode }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(d.error ?? '登録に失敗しました')
        }
      } else {
        const res = await fetch('/api/auth/sign-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, password }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(d.error ?? 'ログインに失敗しました')
        }
      }
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="absolute right-4 top-4">
        <LangToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight gold-text">INMU PORTAL</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('tagline')}</p>
        </div>

        <div className="rounded-2xl border border-border glass p-6">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled className="min-h-11 justify-center text-xs">
              {t('signin_with_x')}
            </Button>
            <Button type="button" variant="outline" disabled className="min-h-11 justify-center text-xs">
              {t('signin_with_discord')}
            </Button>
          </div>
          <p className="mb-4 text-center text-[11px] text-muted-foreground">{t('demo_notice')}</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">ユーザー名</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="username"
                className="min-h-11 text-base"
                placeholder="例: taro"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                className="min-h-11 text-base"
              />
            </div>
            {mode === 'sign-up' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="passcode">パスコード</Label>
                <Input
                  id="passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                  autoComplete="off"
                  className="min-h-11 text-base"
                  placeholder="招待パスコードを入力"
                />
              </div>
            )}
            <Button type="submit" disabled={loading} className="min-h-11 w-full font-semibold">
              {loading ? t('loading') : mode === 'sign-up' ? t('signup') : t('signin')}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'sign-in' ? (
              <>アカウントがありませんか？{' '}<Link href="/sign-up" className="font-medium text-primary hover:underline">{t('signup')}</Link></>
            ) : (
              <>すでにアカウントをお持ちですか？{' '}<Link href="/sign-in" className="font-medium text-primary hover:underline">{t('signin')}</Link></>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
