import { ArrowLeft } from 'lucide-react'
import { Link } from 'wouter'
import { LangToggle } from '@/components/lang-toggle'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'

const legal = {
  ja: {
    back: 'ログイン画面へ戻る',
    termsTitle: '利用規約',
    terms: [
      ['サービスについて', 'INMU PORTALは、INMUコミュニティ向けのゲーム、ポイント、ランキングなどを提供するWebサービスです。本規約に同意したうえでご利用ください。'],
      ['アカウント管理', '利用者は登録情報を適切に管理し、第三者による不正利用を防止してください。複数アカウントによる報酬の重複取得や、他の利用者になりすます行為は禁止します。'],
      ['禁止事項', '法令や公序良俗に反する行為、不正アクセス、サービス運営の妨害、データの不正取得・改ざん、他の利用者へ迷惑をかける行為を禁止します。'],
      ['ゲーム・報酬', 'ゲーム内容、提供割合、ポイント、報酬、イベントは、運営上の必要に応じて変更または終了する場合があります。不具合を利用した不正な報酬取得は無効となる場合があります。'],
      ['停止・変更', '保守、障害、安全上の理由などにより、事前の案内なく一時的にサービスを停止する場合があります。重要な変更は、可能な範囲でお知らせまたは通知に掲載します。'],
      ['免責', '外部サービス、通信環境、端末環境などに起因する損害について、運営は法令で認められる範囲を超えて責任を負いません。'],
    ],
    privacyTitle: 'プライバシーポリシー',
    privacy: [
      ['取得する情報', 'アカウント名、認証情報、ゲームデータ、ポイント・取引履歴、任意で登録されたSOLアドレス、利用端末やアクセスに関する情報を取得する場合があります。'],
      ['利用目的', '本人確認、サービス提供、データ保存、不正利用防止、問い合わせ対応、機能改善、イベント運営のために利用します。'],
      ['Cookieについて', 'ログイン状態の維持、利便性向上、不正利用防止、利用状況の把握のためにCookie等を利用する場合があります。ブラウザの設定からCookieを制限できますが、一部機能が利用できなくなることがあります。'],
      ['Google AdSenseについて', '広告配信のため、Googleや第三者配信事業者がCookieを使用する場合があります。利用者はGoogleの広告設定からパーソナライズ広告を管理できます。広告は本文のある対象ページに限って表示します。'],
      ['Google Analyticsについて', '今後、サービス改善を目的としてGoogle Analyticsを導入する場合があります。収集される情報は個人を直接特定しない形で利用状況の分析に使用します。'],
      ['外部リンクについて', '公式X、Discord、INMU大富豪など外部サービスの利用には、各サービスの規約とプライバシーポリシーが適用されます。'],
      ['セキュリティについて', 'ユーザー情報を保護するため、認証、アクセス制御、不正利用の監視など必要な安全対策を継続的に見直します。'],
      ['ポリシー変更について', '法令やサービス内容の変更に応じて本ポリシーを改定する場合があります。重要な変更はお知らせまたは通知に掲載します。'],
    ],
    updated: '最終更新: 2026年7月28日',
  },
  en: {
    back: 'Back to sign in',
    termsTitle: 'Terms of Use',
    terms: [
      ['About the service', 'INMU PORTAL is a web service offering games, points, rankings, and other features for the INMU community. Use of the service requires acceptance of these terms.'],
      ['Account management', 'Keep your account information secure and prevent unauthorized use. Multiple accounts for duplicate rewards and impersonation are prohibited.'],
      ['Prohibited conduct', 'Illegal activity, unauthorized access, interference with service operation, data tampering, and conduct that harms other users are prohibited.'],
      ['Games and rewards', 'Game content, rates, points, rewards, and events may be changed or ended when necessary. Rewards obtained by exploiting defects may be invalidated.'],
      ['Suspension and changes', 'The service may be temporarily suspended for maintenance, failures, or security reasons. Important changes will be announced when practical.'],
      ['Disclaimer', 'To the extent permitted by law, the operator is not liable for losses caused by external services, networks, or user devices.'],
    ],
    privacyTitle: 'Privacy Policy',
    privacy: [
      ['Information collected', 'We may collect account names, authentication information, game data, point and transaction history, optional SOL addresses, and device or access information.'],
      ['Purpose of use', 'Information is used for authentication, service delivery, data storage, fraud prevention, support, product improvement, and event operation.'],
      ['Cookies', 'Cookies may be used to maintain sessions, improve usability, prevent misuse, and understand usage. Restricting cookies may disable some features.'],
      ['Google AdSense', 'Google and third-party vendors may use cookies to serve ads. Users can manage personalized ads through Google ad settings. Ads are limited to eligible pages with substantive content.'],
      ['Google Analytics', 'Google Analytics may be introduced to improve the service. Collected data will be used to analyze usage without directly identifying individuals.'],
      ['External links', 'External services such as official X, Discord, and INMU Daifugo are governed by their own terms and privacy policies.'],
      ['Security', 'We continuously review authentication, access controls, and monitoring measures to protect user information.'],
      ['Policy changes', 'This policy may be revised in response to legal or service changes. Important revisions will be announced.'],
    ],
    updated: 'Last updated: July 28, 2026',
  },
} as const

export function PublicLegalPage({ type }: { type: 'terms' | 'privacy' }) {
  const { locale } = useI18n()
  const copy = legal[locale]
  const title = type === 'terms' ? copy.termsTitle : copy.privacyTitle
  const sections = type === 'terms' ? copy.terms : copy.privacy

  return (
    <main className="min-h-dvh bg-background px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/sign-in" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{copy.back}</Link>
          <LangToggle />
        </div>
        <header className="mb-6"><p className="text-sm font-semibold text-primary">INMU PORTAL</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{copy.updated}</p></header>
        <Card className="border-border bg-card">
          <CardContent className="space-y-7 p-5 sm:p-7">
            {sections.map(([heading, body]) => <section key={heading}><h2 className="text-lg font-bold">{heading}</h2><p className="mt-2 text-sm leading-8 text-muted-foreground">{body}</p></section>)}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
