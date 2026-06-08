import { Logo } from '@/components/logo'
import { LangToggle } from '@/components/lang-toggle'
import { signOut } from '@/lib/auth-client'
import { useI18n } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/dict'
import { cn } from '@/lib/utils'
import {
  Bell, Coins, History, LayoutDashboard,
  LogOut, Shield, Star, Trophy, User as UserIcon, Users,
} from 'lucide-react'
import { Link, useLocation } from 'wouter'

type NavItem = { href: string; key: TranslationKey; icon: React.ElementType; adminOnly?: boolean }

const ALL_NAV: NavItem[] = [
  { href: '/',              key: 'nav_dashboard',     icon: LayoutDashboard },
  { href: '/balance',       key: 'nav_balance',       icon: Coins },
  { href: '/history',       key: 'nav_history',       icon: History },
  { href: '/points',        key: 'nav_points',        icon: Star },
  { href: '/ranking',       key: 'nav_ranking',       icon: Trophy },
  { href: '/notifications', key: 'nav_notifications', icon: Bell },
  { href: '/community',     key: 'nav_community',     icon: Users },
  { href: '/profile',       key: 'nav_profile',       icon: UserIcon },
  { href: '/admin',         key: 'nav_admin',         icon: Shield, adminOnly: true },
]

export function AppShell({
  children,
  isAdmin,
  displayName,
  unread,
}: {
  children: React.ReactNode
  isAdmin: boolean
  displayName: string
  unread: number
}) {
  const { t } = useI18n()
  const [location, navigate] = useLocation()

  const visibleNav = ALL_NAV.filter((item) => !item.adminOnly || isAdmin)

  async function handleSignOut() {
    await signOut()
    navigate('/sign-in')
  }

  const isActive = (href: string) =>
    href === '/' ? location === '/' : location.startsWith(href)

  return (
    <div className="min-h-dvh">
      {/* ── Desktop sidebar (lg+) ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Logo size={32} />
          <span className="font-bold tracking-tight gold-text">INMU Bank</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {visibleNav.map((item) => {
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
                    <span>{t(item.key)}</span>
                    {item.href === '/notifications' && unread > 0 && (
                      <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="size-[17px]" />
            {t('nav_signout')}
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={26} />
            <span className="font-bold tracking-tight gold-text text-sm">INMU Bank</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">{t('tagline')}</p>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle />
          </div>
        </header>

        {/* Page content — bottom padding for tab bar */}
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ── Mobile scrollable bottom tab bar ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/98 backdrop-blur-md lg:hidden">
        <ul className="flex items-stretch overflow-x-auto scrollbar-none">
          {visibleNav.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <li key={item.href} className="flex-shrink-0">
                <Link
                  href={item.href}
                  className={cn(
                    'flex min-h-[60px] w-[72px] flex-col items-center justify-center gap-1 text-[9px] font-medium transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span className="relative">
                    <Icon className="size-[20px]" />
                    {item.href === '/notifications' && unread > 0 && (
                      <span className="absolute -right-2 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground">
                        {unread > 9 ? '9' : unread}
                      </span>
                    )}
                  </span>
                  <span className="leading-none text-center w-full truncate px-1">{t(item.key)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
