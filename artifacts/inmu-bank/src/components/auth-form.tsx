import { type FormEvent, type ReactNode, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  Bell,
  CalendarDays,
  CircleHelp,
  Coins,
  ExternalLink,
  Gamepad2,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Trophy,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LangToggle } from '@/components/lang-toggle'
import { useI18n } from '@/lib/i18n/context'

type Feature = { title: string; detail: string; icon: LucideIcon }
type Game = { title: string; detail: string; image: string; icon: LucideIcon }
type Notice = { date: string; title: string; detail: string }
type Faq = { question: string; answer: string }

const content = {
  ja: {
    tagline: 'INMUコミュニティの総合プラットフォーム',
    lead: '育成ゲーム、ポイント、ランキング、ミッションなどをひとつのアカウントで楽しめる、コミュニティ向けWebサービスです。',
    username: 'ユーザー名',
    usernamePlaceholder: '例: taro',
    passcode: 'パスコード',
    passcodePlaceholder: '送付されたコードを入力してください',
    passcodeHelp: '登録時に使用する招待制のパスコードです。',
    login: 'ログイン',
    signup: '新規登録',
    noAccount: 'アカウントをお持ちでない方は',
    hasAccount: 'すでにアカウントをお持ちの方は',
    aboutTitle: 'INMU PORTALとは',
    about: [
      'INMU PORTALは、INMUコミュニティ向けに開発された総合Webプラットフォームです。ひとつのアカウントで、育成ゲームやポイント機能など複数のコンテンツを利用できます。',
      'INMU PET、INMU大富豪、ガチャ、ミッション、ランキング、SOLアドレス登録など、日々楽しめる機能を提供しています。ゲームの進行状況や獲得した報酬はアカウントへ保存されます。',
      '利用者から寄せられた意見や不具合報告を確認しながら、遊びやすさと安全性の改善を継続しています。',
    ],
    featuresTitle: '主な機能',
    features: [
      { title: 'INMU PET', detail: 'キャラクターへご飯をあげたり、遊んだり、散歩へ送り出したりできる育成ゲームです。成長に応じてレベル報酬や固有の効果を楽しめます。', icon: Gamepad2 },
      { title: 'ポイントシステム', detail: 'ログインやミッションなど、サービス内の活動でポイントを獲得できます。貯めたポイントは対応するゲーム内機能で利用できます。', icon: Coins },
      { title: 'ガチャ', detail: 'ポイントガチャとINMUガチャから、キャラクターや育成アイテムなどを獲得できます。提供割合と開催内容はガチャ画面で確認できます。', icon: Sparkles },
      { title: 'ランキング', detail: 'INMUやポイントの保有状況、月間取引高などを順位として確認できます。累計と月間を分け、目的のランキングを探しやすくしています。', icon: Trophy },
      { title: 'ミッション', detail: 'デイリーや継続目標を達成すると、ポイントやアイテムなどの報酬を受け取れます。進捗はミッション画面に保存されます。', icon: CalendarDays },
      { title: 'SOLアドレス登録', detail: '任意でSOLアドレスを登録し、対応する残高表示や取引確認機能を利用できます。登録しなくても遊べるコンテンツがあります。', icon: WalletCards },
    ] as Feature[],
    gamesTitle: 'INMU PORTALで遊べるコンテンツ',
    gamesLead: 'ログイン後に利用できる代表的なコンテンツを紹介します。画像が読み込めない場合でも、各機能の説明はそのまま確認できます。',
    games: [
      { title: 'INMU PET', detail: 'キャラクターを育成し、ご飯・遊び・散歩などのお世話を行う育成コンテンツです。キャラクターごとに固有スキルやレベル報酬があり、イベントやクエストにも参加できます。毎日の短いお世話から、長期的な育成まで自分のペースで楽しめます。', image: '/service-previews/inmu-pet.jpg', icon: Gamepad2 },
      { title: 'INMU大富豪', detail: 'INMU PORTAL独自ルールを取り入れた大富豪ゲームです。通常対戦に加えて、レベルごとに条件の異なるチャレンジモードを楽しめます。PORTALのアカウントから移動でき、対応ミッションの進捗にも反映されます。', image: '/service-previews/daifugo.jpg', icon: Gamepad2 },
      { title: 'ガチャ', detail: 'ゲーム内ポイントやINMUを使用して、キャラクターや育成アイテムなどを獲得できます。無料ガチャや期間限定ガチャも実施されます。提供割合や対象キャラクターは、ガチャを引く前に画面内で確認できます。', image: '/service-previews/gacha.jpg', icon: Sparkles },
      { title: 'ランキング', detail: 'INMU保有量、ポイント、月間取引高などをもとに、ユーザー同士で順位を確認できる機能です。累計ランキングと月間ランキングを切り替えられます。残高の公開設定にも配慮した表示を採用しています。', image: '/service-previews/ranking.jpg', icon: Trophy },
      { title: 'ミッション', detail: 'デイリーや継続目標を達成することで、ポイントやアイテムなどの報酬を獲得できます。達成状況はアカウントごとに保存され、受け取れる報酬を画面で確認できます。日々の遊び方を見つける目安としても利用できます。', image: '/service-previews/missions.jpg', icon: CalendarDays },
    ] as Game[],
    safetyTitle: '安全性',
    safety: [
      { title: 'SOLアドレス登録対応', detail: '必要な機能を利用する場合に限り、任意で登録できます。', icon: WalletCards },
      { title: 'ユーザー情報保護', detail: '認証情報やゲームデータを適切に管理し、不正利用への対策を続けています。', icon: LockKeyhole },
      { title: '継続的なアップデート', detail: '不具合報告を確認し、安定性や使いやすさを継続的に改善しています。', icon: ShieldCheck },
    ] as Feature[],
    noticesTitle: 'お知らせ',
    notices: [
      { date: '2026/07/29', title: 'INMU PETのキャラクター選択を改善しました', detail: '育成キャラクター選択で、キャラクターを長押しして好きな順番に並べ替えられるようになりました。' },
      { date: '2026/07/28', title: 'ログインページのサービス紹介を更新しました', detail: '初めて訪れた方にも内容が伝わるよう、各ゲームや主要機能の説明、FAQを充実させました。' },
      { date: '2026/07/25', title: '不具合報告機能を追加しました', detail: '各画面から不具合を報告できる窓口を追加し、運営側で確認しやすくしました。' },
      { date: '2026/07/21', title: 'INMU大富豪との連携を開始しました', detail: 'INMU PORTALのアカウントからINMU大富豪へ移動し、対応ミッションを楽しめるようになりました。' },
      { date: '2026/07/17', title: 'ガチャ内容を更新しました', detail: 'ポイントガチャとINMUガチャの名称や表示を整理し、新しい開催内容へ更新しました。' },
    ] as Notice[],
    faqTitle: 'よくある質問',
    faqs: [
      { question: 'INMU PORTALとは何ですか？', answer: 'INMUコミュニティ向けの総合Webプラットフォームです。育成ゲーム、カードゲーム、ポイント、ガチャ、ミッション、ランキングなどをひとつのアカウントで利用できます。' },
      { question: '無料で利用できますか？', answer: '基本機能は無料で利用できます。一部のゲーム内機能では、ポイントやINMUを使用する場合があります。' },
      { question: 'INMUとは何ですか？', answer: 'INMU PORTAL内の一部機能や表示に使用されるトークンです。残高や関連情報は、対応画面から確認できます。' },
      { question: 'ポイントは何に使えますか？', answer: 'ポイントガチャや対応するゲーム内機能に使用できます。ログインやミッションなどで獲得できます。' },
      { question: 'INMU PETとは何ですか？', answer: 'キャラクターへご飯をあげたり、遊んだり、散歩へ送り出したりして育てるコンテンツです。キャラクターごとに成長要素や報酬があります。' },
      { question: 'INMU大富豪とは何ですか？', answer: '通常対戦とチャレンジモードを楽しめる大富豪ゲームです。INMU PORTALのアカウントから連携して遊べます。' },
      { question: 'ガチャにはどのような種類がありますか？', answer: 'ポイントを使用するポイントガチャと、INMUを使用するINMUガチャがあります。開催内容や提供割合はガチャ画面で確認できます。' },
      { question: 'SOLアドレスは公開されますか？', answer: '登録したアドレスは、必要な機能の処理に使用します。プロフィールの公開設定や各画面の説明を確認してから登録してください。' },
      { question: '複数アカウントを作成できますか？', answer: '不正利用や報酬の重複取得を避けるため、複数アカウントの作成は行わないでください。利用ルールに従ってひとつのアカウントをご利用ください。' },
      { question: '困った場合はどこで確認できますか？', answer: 'ログイン後の不具合報告ボタン、公式X、Discordから確認・連絡できます。重要な対応内容は通知画面にも掲載します。' },
    ] as Faq[],
    operator: '運営: INMU PORTAL運営',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    officialX: '公式X',
  },
  en: {
    tagline: 'The all-in-one platform for the INMU community',
    lead: 'A community web service where one account gives you access to games, points, rankings, missions, and more.',
    username: 'Username',
    usernamePlaceholder: 'Example: taro',
    passcode: 'Passcode',
    passcodePlaceholder: 'Enter the invitation code',
    passcodeHelp: 'An invitation passcode used when registering.',
    login: 'Sign in',
    signup: 'Create account',
    noAccount: 'New to INMU PORTAL?',
    hasAccount: 'Already have an account?',
    aboutTitle: 'About INMU PORTAL',
    about: [
      'INMU PORTAL is an all-in-one web platform developed for the INMU community. One account provides access to several games and community features.',
      'The service includes INMU PET, INMU Daifugo, gacha, missions, rankings, points, and optional SOL address registration. Progress and earned rewards are saved to your account.',
      'We continuously improve usability and reliability by reviewing feedback and bug reports from our users.',
    ],
    featuresTitle: 'Main features',
    features: [
      { title: 'INMU PET', detail: 'Raise characters by feeding them, playing with them, and sending them on walks. Each character has growth rewards and unique effects.', icon: Gamepad2 },
      { title: 'Points', detail: 'Earn points through logins, missions, and other activities. Points can be used with supported in-game features.', icon: Coins },
      { title: 'Gacha', detail: 'Use points or INMU to obtain characters and training items. Current rates and available rewards are shown before each draw.', icon: Sparkles },
      { title: 'Rankings', detail: 'View cumulative and monthly rankings based on INMU, points, and monthly trading volume.', icon: Trophy },
      { title: 'Missions', detail: 'Complete daily and ongoing goals to earn points and items. Mission progress is saved to your account.', icon: CalendarDays },
      { title: 'SOL address', detail: 'Optionally register a SOL address for supported balance and transaction features. Many features work without one.', icon: WalletCards },
    ] as Feature[],
    gamesTitle: 'Things to play on INMU PORTAL',
    gamesLead: 'Here are the main experiences available after signing in. Descriptions remain available even if a preview image cannot be loaded.',
    games: [
      { title: 'INMU PET', detail: 'Raise characters by feeding them, playing with them, and taking them for walks. Each character offers unique skills and level rewards, with events and quests adding more ways to play. You can enjoy quick daily care or work toward long-term growth.', image: '/service-previews/inmu-pet.jpg', icon: Gamepad2 },
      { title: 'INMU Daifugo', detail: 'A Daifugo card game featuring original INMU PORTAL rules. In addition to regular play, challenge mode offers different objectives at each level. Launch it from your PORTAL account and make progress on supported missions.', image: '/service-previews/daifugo.jpg', icon: Gamepad2 },
      { title: 'Gacha', detail: 'Use in-game points or INMU to obtain characters and training items. Free and limited-time draws may also be available. Rates and available characters are displayed before you draw.', image: '/service-previews/gacha.jpg', icon: Sparkles },
      { title: 'Rankings', detail: 'Compare rankings based on INMU holdings, points, and monthly trading volume. Cumulative and monthly views make different activities easy to follow. Balance privacy settings are respected in ranking displays.', image: '/service-previews/ranking.jpg', icon: Trophy },
      { title: 'Missions', detail: 'Complete daily and ongoing objectives to earn points and items. Progress is saved per account and available rewards are shown clearly. Missions also provide a useful guide to what you can do each day.', image: '/service-previews/missions.jpg', icon: CalendarDays },
    ] as Game[],
    safetyTitle: 'Safety',
    safety: [
      { title: 'Optional SOL registration', detail: 'Register an address only when you need a supported feature.', icon: WalletCards },
      { title: 'User data protection', detail: 'Authentication and game data are managed with ongoing protection against misuse.', icon: LockKeyhole },
      { title: 'Continuous updates', detail: 'We review bug reports and continuously improve stability and usability.', icon: ShieldCheck },
    ] as Feature[],
    noticesTitle: 'Updates',
    notices: [
      { date: '2026/07/29', title: 'Improved character selection in INMU PET', detail: 'You can now press and hold a character in the selection list and drag it into your preferred order.' },
      { date: '2026/07/28', title: 'Expanded our public service guide', detail: 'We added clearer introductions to our games, main features, and frequently asked questions.' },
      { date: '2026/07/25', title: 'Added bug reporting', detail: 'Users can now send bug reports from the service for review by the operations team.' },
      { date: '2026/07/21', title: 'Started INMU Daifugo integration', detail: 'You can launch INMU Daifugo from your PORTAL account and complete supported missions.' },
      { date: '2026/07/17', title: 'Updated gacha content', detail: 'Point Gacha and INMU Gacha names and displays were reorganized for the current event.' },
    ] as Notice[],
    faqTitle: 'Frequently asked questions',
    faqs: [
      { question: 'What is INMU PORTAL?', answer: 'It is an all-in-one platform for the INMU community, offering games, points, gacha, missions, and rankings through one account.' },
      { question: 'Is it free to use?', answer: 'The core features are free. Some in-game features may use points or INMU.' },
      { question: 'What is INMU?', answer: 'INMU is a token used by certain features and displays in INMU PORTAL. Related balances can be checked on supported pages.' },
      { question: 'What can points be used for?', answer: 'Points can be used for Point Gacha and other supported features. You can earn them from logins and missions.' },
      { question: 'What is INMU PET?', answer: 'It is a character-raising game where you feed, play with, and walk your characters to help them grow.' },
      { question: 'What is INMU Daifugo?', answer: 'It is a Daifugo card game with regular play and a level-based challenge mode, linked to your PORTAL account.' },
      { question: 'What kinds of gacha are available?', answer: 'Point Gacha uses points and INMU Gacha uses INMU. Current contents and rates are shown on the gacha page.' },
      { question: 'Is my SOL address public?', answer: 'It is used for supported features. Review the profile privacy setting and on-screen guidance before registration.' },
      { question: 'Can I create multiple accounts?', answer: 'Please use one account to prevent misuse and duplicate reward claims.' },
      { question: 'Where can I get help?', answer: 'Use the in-app bug report button, official X account, or Discord. Important responses also appear in notifications.' },
    ] as Faq[],
    operator: 'Operated by the INMU PORTAL team',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    officialX: 'Official X',
  },
} as const

function PublicAccordion({ value, title, icon, children, open = false }: { value: string; title: string; icon: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <Card className="border-border bg-card/90">
      <CardContent className="p-0">
        <Accordion type="single" collapsible defaultValue={open ? value : undefined}>
          <AccordionItem value={value} className="border-0 px-5">
            <AccordionTrigger className="text-base font-bold">
              <span className="flex items-center gap-2">{icon}{title}</span>
            </AccordionTrigger>
            <AccordionContent>{children}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}

function PreviewCard({ game }: { game: Game }) {
  const [imageFailed, setImageFailed] = useState(false)
  const Icon = game.icon
  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
      <div className="aspect-[4/3] bg-secondary/40">
        {imageFailed ? (
          <div className="flex h-full items-center justify-center"><Icon className="size-10 text-primary/70" aria-hidden="true" /></div>
        ) : (
          <img src={game.image} alt={`${game.title} preview`} className="h-full w-full object-contain" loading="lazy" onError={() => setImageFailed(true)} />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2"><Icon className="size-5 text-primary" /><h3 className="text-base font-bold">{game.title}</h3></div>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{game.detail}</p>
      </div>
    </article>
  )
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { t, locale } = useI18n()
  const copy = content[locale]
  const [, navigate] = useLocation()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'sign-up' && passcode.length === 0) {
      toast.error(locale === 'ja' ? 'パスコードを入力してください' : 'Enter your passcode')
      return
    }
    setLoading(true)
    try {
      const endpoint = mode === 'sign-up' ? '/api/auth/sign-up' : '/api/auth/sign-in'
      const body = mode === 'sign-up' ? { name, password, passcode } : { name, password }
      const request = () => fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      let res = await request()
      if (mode === 'sign-in' && res.status === 503) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        res = await request()
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? (locale === 'ja' ? '認証に失敗しました' : 'Authentication failed'))
      }
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="fixed right-4 top-4 z-20"><LangToggle /></div>

      <section className="px-5 pb-8 pt-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 text-center">
          <div className="flex max-w-2xl flex-col items-center gap-3">
            <img src="/app-icon.jpg" alt="INMU PORTAL" className="h-16 w-16 rounded-2xl border border-primary/25 shadow-lg sm:h-[72px] sm:w-[72px]" />
            <h1 className="text-3xl font-bold gold-text sm:text-4xl">INMU PORTAL</h1>
            <p className="text-base font-semibold text-foreground sm:text-lg">{copy.tagline}</p>
            <p className="text-sm leading-7 text-muted-foreground">{copy.lead}</p>
          </div>

          <Card className="w-full max-w-sm border-primary/25 bg-card/95 text-left shadow-xl">
            <CardHeader className="pb-2 pt-4"><CardTitle className="text-lg">{mode === 'sign-up' ? copy.signup : copy.login}</CardTitle></CardHeader>
            <CardContent className="pb-4">
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">{copy.username}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="username" placeholder={copy.usernamePlaceholder} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{t('password')}</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} />
                </div>
                {mode === 'sign-up' && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="passcode">{copy.passcode}</Label>
                    <Input id="passcode" type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} required autoComplete="off" placeholder={copy.passcodePlaceholder} />
                    <p className="text-xs leading-5 text-muted-foreground">{copy.passcodeHelp}</p>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="mt-1 min-h-11 w-full font-semibold">
                  {loading ? t('loading') : mode === 'sign-up' ? copy.signup : copy.login}
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {mode === 'sign-in' ? <>{copy.noAccount} <Link href="/sign-up" className="font-medium text-primary hover:underline">{copy.signup}</Link></> : <>{copy.hasAccount} <Link href="/sign-in" className="font-medium text-primary hover:underline">{copy.login}</Link></>}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 pb-12">
        <div className="mx-auto grid w-full max-w-6xl gap-5">
          <PublicAccordion value="about" title={copy.aboutTitle} icon={<CircleHelp className="size-5 text-primary" />} open>
            <div className="space-y-3 pb-2 text-sm leading-7 text-muted-foreground">{copy.about.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          </PublicAccordion>

          <PublicAccordion value="features" title={copy.featuresTitle} icon={<Sparkles className="size-5 text-primary" />} open>
            <div className="grid gap-3 pb-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
              {copy.features.map(({ title, detail, icon: Icon }) => (
                <article key={title} className="rounded-md border border-border bg-secondary/30 p-4">
                  <Icon className="size-5 text-primary" />
                  <h3 className="mt-3 text-sm font-bold">{title}</h3>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">{detail}</p>
                </article>
              ))}
            </div>
          </PublicAccordion>

          <section aria-labelledby="game-intro-title" className="py-2">
            <div className="mb-4">
              <h2 id="game-intro-title" className="text-xl font-bold">{copy.gamesTitle}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{copy.gamesLead}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{copy.games.map((game) => <PreviewCard key={game.title} game={game} />)}</div>
          </section>

          <PublicAccordion value="safety" title={copy.safetyTitle} icon={<ShieldCheck className="size-5 text-primary" />}>
            <div className="grid gap-3 pb-2 pt-1 sm:grid-cols-3">
              {copy.safety.map(({ title, detail, icon: Icon }) => (
                <article key={title} className="rounded-md border border-border bg-secondary/30 p-4">
                  <Icon className="size-5 text-primary" /><h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{detail}</p>
                </article>
              ))}
            </div>
          </PublicAccordion>

          <PublicAccordion value="notices" title={copy.noticesTitle} icon={<Megaphone className="size-5 text-primary" />}>
            <div className="grid gap-3 pb-2 pt-1">
              {copy.notices.map((notice) => (
                <article key={`${notice.date}-${notice.title}`} className="rounded-md border border-border bg-secondary/30 p-4">
                  <div className="flex flex-wrap items-center gap-2"><Bell className="size-4 text-primary" /><time className="text-xs text-muted-foreground">{notice.date}</time><h3 className="text-sm font-bold">{notice.title}</h3></div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{notice.detail}</p>
                </article>
              ))}
            </div>
          </PublicAccordion>

          <PublicAccordion value="faq" title={copy.faqTitle} icon={<CircleHelp className="size-5 text-primary" />}>
            <Accordion type="single" collapsible className="pb-2 pt-1">
              {copy.faqs.map((item, index) => (
                <AccordionItem key={item.question} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-7 text-muted-foreground">{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </PublicAccordion>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 text-sm text-muted-foreground">
          <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Public links">
            <Link href="/terms" className="hover:text-primary">{copy.terms}</Link>
            <Link href="/privacy" className="hover:text-primary">{copy.privacy}</Link>
            <a className="inline-flex items-center gap-1 hover:text-primary" href="https://x.com/inmucoin?s=21&t=qie9_vjU0QmQ2J90th9B-Q" target="_blank" rel="noreferrer">{copy.officialX}<ExternalLink className="size-3" /></a>
            <a className="inline-flex items-center gap-1 hover:text-primary" href="https://discord.com/invite/5u4DTDqWZy" target="_blank" rel="noreferrer">Discord<ExternalLink className="size-3" /></a>
          </nav>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><p>{copy.operator}</p><p>© INMU PORTAL</p></div>
        </div>
      </footer>
    </main>
  )
}
