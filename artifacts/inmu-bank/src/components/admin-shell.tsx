import { Logo } from '@/components/logo'
import { cn } from '@/lib/utils'
import { Shield, User as UserIcon, LogOut } from 'lucide-react'
import { Link, useLocation } from 'wouter'

type AdminNavItem = { href: string; label: string; icon: React.ElementType }

const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin/profile', label: 'プロフィール', icon: UserIcon },
  { href: '/admin',         label: '管理ツール',   icon: Shield },
]

export function AdminShell({
  children,
  onLogout,
}: {
  children: React.ReactNode
  onLogout: () => void
}) {
  const [location] = useLocation()

  const isActive = (href: string) =>
    href === '/admin' ? location === '/admin' : location.startsWith(href)

  return (
    <div className="min-h-dvh">
      {/* ── Desktop sidebar (lg+) ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Logo size={32} />
          <div className="flex flex-col">
            <span className="font-bold tracking-tight gold-text text-sm">INMU PORTAL</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Shield className="size-3 text-primary" /> 管理者
            </span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon className="size-[17px] shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="size-[17px]" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={26} />
            <span className="font-bold tracking-tight gold-text text-sm">INMU PORTAL</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-1">
              <Shield className="size-3 text-primary" /> 管理者
            </span>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Shield className="size-3 text-primary" /> 管理者専用画面
            </p>
          </div>
          <div />
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom tab bar (admin only: 2 items) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/98 backdrop-blur-md lg:hidden">
        <ul className="flex items-stretch">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    'flex min-h-[60px] w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-[22px]" />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
