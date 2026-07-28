import { ArrowLeft, Home } from 'lucide-react'
import { Link } from 'wouter'

export function NotFoundPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-bold">ページが見つかりません</h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          URLが変更されたか、ページが削除された可能性があります。INMU PORTALのトップページから、
          サービス紹介やログイン画面をご確認ください。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground"
          >
            <Home className="h-4 w-4" />
            トップページ
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-3 font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            前のページへ戻る
          </button>
        </div>
      </div>
    </main>
  )
}
