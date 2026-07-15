import { type FormEvent, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Coins,
  ExternalLink,
  Gamepad2,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Trophy,
  type LucideIcon,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LangToggle } from '@/components/lang-toggle'
import { useI18n } from '@/lib/i18n/context'

type FeatureItem = {
  title: string
  detail: string
  note?: string
  icon: LucideIcon
}

const features: FeatureItem[] = [
  { title: 'INMU PET（育成ゲーム）', detail: 'キャラクターを育成し、レベル報酬や散歩を楽しめる育成ゲームです。', icon: Gamepad2 },
  { title: 'ポイントシステム', detail: 'ログインやミッションなど、活動に応じたポイント機能を提供します。', icon: Coins },
  { title: 'ガチャ', detail: 'INMU PETのキャラクターや育成に関わる要素を獲得できる機能です。', note: '注意: ガチャ結果は抽選で決まり、必ず希望のキャラクターや報酬が出るものではありません。', icon: Sparkles },
  { title: '購入申請', detail: '条件を満たしたユーザーが、購入申請や還元に関する手続きを確認できる機能です。', note: '注意: 申請可能数や還元率はスロット解放状況、キャラクタースキル、運営ルールにより変動します。', icon: WalletCards },
  { title: 'ランキング', detail: 'コミュニティ内の活動状況をランキング形式で確認できます。', icon: Trophy },
  { title: 'イベント', detail: '期間限定イベントやアップデート情報をポータル内で案内します。', icon: CalendarDays },
  { title: 'SOLアドレス登録', detail: '必要に応じてSOLアドレスを登録し、各種機能と連携できます。', icon: WalletCards },
]

const safetyItems = [
  { title: 'SOLアドレス登録対応', icon: WalletCards },
  { title: 'ユーザー情報保護', icon: LockKeyhole },
  { title: '継続的なアップデート', icon: ShieldCheck },
]

const notices = [
  { title: 'INMU PET機能を継続改善中', detail: '育成・散歩・レベル報酬など、コミュニティ向け機能を順次調整しています。' },
  { title: 'ランキング表示を改善', detail: '累計ポイントや受取INMUの表示を見やすく調整しました。' },
  { title: '購入申請関連の仕様調整予定', detail: '2026年7月16日よりスロット数に応じた通常還元率へ切り替え予定です。' },
]

const faqItems = [
  { question: '利用料金はかかりますか？', answer: '基本機能は無料でご利用いただけます。' },
  { question: 'ウォレットは必須ですか？', answer: '一部機能ではSOLアドレス登録をご利用いただけますが、登録しなくても利用できる機能があります。' },
  { question: 'スマートフォンでも利用できますか？', answer: 'はい。スマートフォン・タブレット・PCに対応しています。' },
  { question: 'データは保存されますか？', answer: 'アカウント情報およびゲームデータは安全に保存されます。' },
]

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { t } = useI18n()
  const [, navigate] = useLocation()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'sign-up' && passcode.length === 0) {
      toast.error('パスコードを入力してください')
      return
    }
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
        const requestSignIn = () => fetch('/api/auth/sign-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, password }),
        })
        let res = await requestSignIn()
        if (res.status === 503) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000))
          res = await requestSignIn()
        }
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
    <main className="min-h-dvh bg-background">
      <div className="fixed right-4 top-4 z-20">
        <LangToggle />
      </div>

      <section className="px-5 pb-10 pt-10 sm:pt-14">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <img src="/app-icon.jpg" alt="INMU PORTAL" className="h-20 w-20 rounded-2xl border border-primary/25 shadow-lg" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight gold-text sm:text-5xl">INMU PORTAL</h1>
              <p className="mt-3 text-base font-semibold text-foreground sm:text-xl">INMUコミュニティの総合プラットフォーム</p>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                育成ゲーム、ポイント、ランキング、イベント、SOLアドレス登録などをまとめて利用できるコミュニティ向けWebサービスです。
              </p>
            </div>
          </div>

          <Card className="w-full max-w-md border-primary/25 bg-card/95 text-left shadow-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{mode === 'sign-up' ? '新規登録' : 'ログイン'}</CardTitle>
            </CardHeader>
            <CardContent>
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
                      placeholder="招待コードを入力してください"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      登録時に使用する招待制のパスコードです。
                    </p>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="min-h-11 w-full font-semibold">
                  {loading ? t('loading') : mode === 'sign-up' ? t('signup') : t('signin')}
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                {mode === 'sign-in' ? (
                  <>アカウントをお持ちでない方は <Link href="/sign-up" className="font-medium text-primary hover:underline">{t('signup')}</Link></>
                ) : (
                  <>すでにアカウントをお持ちの方は <Link href="/sign-in" className="font-medium text-primary hover:underline">{t('signin')}</Link></>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 pb-12">
        <div className="mx-auto grid w-full max-w-6xl gap-5">
          <Card className="border-border bg-card/90">
            <CardContent className="p-0">
              <Accordion type="single" collapsible>
                <AccordionItem value="about" className="border-0 px-5">
                  <AccordionTrigger className="text-base font-bold">INMU PORTALとは</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                    <p>INMU PORTALは、INMUコミュニティ向けに開発された総合Webプラットフォームです。</p>
                    <p>育成ゲーム、ポイント機能、SOLアドレス登録、イベント、ランキングなど様々なサービスを提供しています。</p>
                    <p>今後も継続的に新機能を追加予定です。</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/90">
            <CardContent className="p-0">
              <Accordion type="single" collapsible>
                <AccordionItem value="features" className="border-0 px-5">
                  <AccordionTrigger className="text-base font-bold">
                    <span className="flex items-center gap-2">
                      <Sparkles className="size-5 text-primary" />
                      主な機能
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                      {features.map(({ title, detail, note, icon: Icon }) => (
                        <div key={title} className="flex h-full flex-col gap-3 rounded-md border border-border bg-secondary/30 p-4">
                          <Icon className="size-5 text-primary" />
                          <div>
                            <h3 className="text-sm font-bold">{title}</h3>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
                            {note && <p className="mt-2 text-[11px] leading-5 text-amber-200">{note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/90">
            <CardContent className="p-0">
              <Accordion type="single" collapsible>
                <AccordionItem value="safety" className="border-0 px-5">
                  <AccordionTrigger className="text-base font-bold">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="size-5 text-primary" />
                      安全性
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 pt-1 sm:grid-cols-3">
                      {safetyItems.map(({ title, icon: Icon }) => (
                        <div key={title} className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 p-3">
                          <Icon className="size-4 text-primary" />
                          <span className="text-sm font-medium">{title}</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/90">
            <CardContent className="p-0">
              <Accordion type="single" collapsible>
                <AccordionItem value="notices" className="border-0 px-5">
                  <AccordionTrigger className="text-base font-bold">
                    <span className="flex items-center gap-2">
                      <Megaphone className="size-5 text-primary" />
                      お知らせ
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 pt-1">
                      {notices.map((notice) => (
                        <div key={notice.title} className="rounded-md border border-border bg-secondary/30 p-3">
                          <div className="flex items-center gap-2">
                            <Bell className="size-4 text-primary" />
                            <h3 className="text-sm font-bold">{notice.title}</h3>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{notice.detail}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/90">
            <CardContent className="p-0">
              <Accordion type="single" collapsible>
                <AccordionItem value="faq" className="border-0 px-5">
                  <AccordionTrigger className="text-base font-bold">
                    <span className="flex items-center gap-2">
                      <CircleHelp className="size-5 text-primary" />
                      よくある質問
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Accordion type="single" collapsible className="pt-1">
                      {faqItems.map((item, index) => (
                        <AccordionItem key={item.question} value={`faq-${index}`}>
                          <AccordionTrigger>{item.question}</AccordionTrigger>
                          <AccordionContent className="text-sm leading-6 text-muted-foreground">{item.answer}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-8">
        <div className="mx-auto grid max-w-6xl gap-5">
          <Accordion type="single" collapsible className="rounded-lg border border-border bg-card/90 px-4">
            <AccordionItem value="terms">
              <AccordionTrigger>利用規約</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                <p>INMU PORTALは、INMUコミュニティ向け機能を提供するWebサービスです。利用者は、法令および公序良俗に反する行為、不正アクセス、他者への迷惑行為を行わないものとします。</p>
                <p>サービス内容、ポイント、イベント、ゲーム機能は、運営上の必要に応じて変更・停止される場合があります。</p>
                <p>利用者の不正利用が確認された場合、アカウント制限やデータ修正など必要な対応を行うことがあります。</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="privacy" className="border-0">
              <AccordionTrigger>プライバシーポリシー</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                <p><strong className="text-foreground">取得する情報:</strong> アカウント名、ログイン情報、ゲームデータ、ポイント履歴、登録されたSOLアドレス、利用端末やアクセスに関する情報を取得する場合があります。</p>
                <p><strong className="text-foreground">利用目的:</strong> 本人確認、サービス提供、ゲームデータ保存、不正利用防止、サポート、機能改善、イベント運営のために利用します。</p>
                <p><strong className="text-foreground">Cookie利用について:</strong> ログイン状態の保持、利便性向上、利用状況の把握のためCookie等を利用する場合があります。</p>
                <p><strong className="text-foreground">Google AdSenseについて:</strong> 広告配信のため、Googleや第三者の広告事業者がCookieを使用する場合があります。ユーザーはGoogleの広告設定からパーソナライズ広告を無効化できます。</p>
                <p><strong className="text-foreground">Google Analyticsについて:</strong> 今後、アクセス解析のためGoogle Analyticsを導入する場合があります。取得情報はサービス改善のために利用します。</p>
                <p><strong className="text-foreground">外部リンクについて:</strong> 公式XやDiscordなど外部サイトの利用は、各サービスの規約およびポリシーに従います。</p>
                <p><strong className="text-foreground">セキュリティについて:</strong> ユーザー情報の保護に努め、必要に応じて継続的に安全対策を見直します。</p>
                <p><strong className="text-foreground">ポリシー変更について:</strong> 本ポリシーは、サービス内容や法令に応じて変更される場合があります。</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <a className="inline-flex items-center gap-1 hover:text-primary" href="https://x.com/inmucoin?s=21&t=qie9_vjU0QmQ2J90th9B-Q" target="_blank" rel="noreferrer">
                公式X <ExternalLink className="size-3" />
              </a>
              <a className="inline-flex items-center gap-1 hover:text-primary" href="https://discord.com/invite/5u4DTDqWZy" target="_blank" rel="noreferrer">
                Discord <ExternalLink className="size-3" />
              </a>
            </div>
            <p className="flex items-center gap-1">
              <CheckCircle2 className="size-4 text-primary" />
              © INMU PORTAL
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
