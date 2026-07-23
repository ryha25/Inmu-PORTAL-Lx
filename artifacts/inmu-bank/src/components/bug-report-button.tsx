import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function BugReportButton() {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    if (!subject.trim() || message.trim().length < 5) {
      toast.error('件名と5文字以上の内容を入力してください')
      return
    }
    setSending(true)
    try {
      const response = await fetch('/api/bug-reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          pageUrl: `${window.location.pathname}${window.location.search}`,
        }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? '送信できませんでした')
      setSubject('')
      setMessage('')
      setOpen(false)
      toast.success('不具合報告を送信しました')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '送信できませんでした')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[76px] right-3 z-50 h-[78px] w-[78px] border-0 bg-transparent p-0 transition-transform hover:scale-105 active:scale-95 lg:bottom-5 lg:right-5 lg:h-[88px] lg:w-[88px]"
        aria-label="バグ報告所を開く"
        title="バグ報告所"
      >
        <img
          src="/bug-report-inmu.png"
          alt=""
          className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
          draggable={false}
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 max-h-[88dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle>バグ報告所</DialogTitle>
            <DialogDescription>
              発生した画面と操作をできるだけ詳しく教えてください。対応後の回答は通知へ届きます。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              件名
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value.slice(0, 100))}
                placeholder="例：10連ガチャが2回実行された"
                maxLength={100}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              不具合の内容
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, 2000))}
                placeholder="発生した操作、表示、時刻など"
                className="min-h-36 resize-y"
                maxLength={2000}
              />
              <span className="text-right text-[10px] font-normal text-muted-foreground">{message.length}/2000</span>
            </label>
            <Button type="button" onClick={submit} disabled={sending}>
              {sending ? '送信中…' : '管理者へ送信'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
