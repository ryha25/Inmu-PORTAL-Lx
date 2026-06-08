import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'wouter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

export function AdminLoginPage() {
  const [, navigate] = useLocation()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/auth/admin-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: { isAdmin: boolean }) => { if (d.isAdmin) navigate('/admin') })
      .catch(() => {})
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/admin-code-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      if (!res.ok) {
        toast.error('コードが正しくありません')
        setCode('')
        inputRef.current?.focus()
        return
      }
      navigate('/admin')
    } catch {
      toast.error('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5">
      <Card className="border-border bg-card w-full max-w-sm p-8">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <Shield className="size-7 text-primary" />
          </div>
          <h1 className="font-bold text-xl gold-text">INMU PORTAL</h1>
          <p className="text-sm font-medium text-foreground">管理画面ログイン</p>
          <p className="text-xs text-muted-foreground text-center">
            管理者コードを入力してください
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            ref={inputRef}
            type="password"
            placeholder="管理者コード"
            value={code}
            onChange={e => setCode(e.target.value)}
            className="min-h-12 text-center text-lg tracking-widest"
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={loading || !code.trim()}
            className="min-h-12 font-semibold"
          >
            <KeyRound className="size-4 mr-2" />
            {loading ? '確認中…' : 'ログイン'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
