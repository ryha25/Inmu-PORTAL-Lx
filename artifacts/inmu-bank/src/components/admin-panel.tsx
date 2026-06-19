import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu, maskWallet } from '@/lib/format'
import { toast } from 'sonner'
import { useState, useEffect, useCallback } from 'react'
import {
  Search, Download, Shield, User, Trash2,
  CheckSquare, Square, Send, Star, Coins,
  WalletCards, History, X as XIcon, MinusCircle, Plus, Edit2, Lock,
  TrendingUp, TrendingDown, RefreshCw, Settings, ShoppingCart,
  CheckCircle2, Clock, XCircle, ArrowUp, ArrowDown, GripVertical,
} from 'lucide-react'
import type { UserRow } from '@/pages/admin-page'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'

interface PhantomProvider {
  isPhantom: boolean
  publicKey?: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
  signTransaction(tx: Transaction): Promise<Transaction>
}
declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider }
    solana?: PhantomProvider
  }
}
function getPhantom(): PhantomProvider | null {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana
  if (window.solana?.isPhantom) return window.solana
  return null
}
function isMobile() { return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) }
function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) }
function openPhantomBrowser() {
  const url = encodeURIComponent(window.location.href)
  const ref = encodeURIComponent(window.location.origin)
  const phantomUrl = `https://phantom.app/ul/browse/${url}?ref=${ref}`
  if (isIOS()) {
    window.location.href = phantomUrl
  } else {
    window.location.href = `intent://browse/${url}#Intent;scheme=phantom;package=app.phantom;S.browser_fallback_url=${encodeURIComponent(phantomUrl)};end`
  }
}
function getAdminRpcUrl() { return `${window.location.origin}/api/solana/rpc-proxy` }

const PHANTOM_PENDING_KEY = 'inmu_admin_pending_purchase_review'
const PHANTOM_PENDING_AIRDROP_KEY = 'inmu_admin_pending_airdrop'

const INMU_MINT_PUBKEY = new PublicKey('4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump')
const INMU_DECIMALS = 6
const AIRDROP_CHUNK_SIZE = 5

type AuditRow = {
  id: number
  adminId: string
  action: string
  targetUserId: string | null
  createdAt: string
}

type TradeTxRow = {
  id: number
  userId: string
  walletAddress: string
  type: string
  tokenAmount: string
  txSignature: string
  dex: string | null
  tradedAt: string
}

const CONDITION_TYPE_OPTIONS = [
  { value: 'none',                    label: '条件なし' },
  { value: 'link_visit',              label: 'リンク訪問' },
  { value: 'follow_x',               label: 'Xフォローする' },
  { value: 'join_discord',            label: 'Discordに参加する' },
  { value: 'inmu_balance',            label: '累計INMU保有枚数' },
  { value: 'login_streak',            label: '連続ログイン日数' },
  { value: 'login_total',             label: '累計ログイン日数' },
  { value: 'buy_daily',               label: 'デイリー購入枚数' },
  { value: 'buy_weekly',              label: 'ウィークリー購入枚数' },
  { value: 'buy_total',               label: '累計購入枚数' },
  { value: 'daily_clears_today',      label: '当日デイリークリア数' },
  { value: 'daily_weekly_count',      label: 'デイリーミッション週間クリア数' },
  { value: 'dex_vote_weekly',         label: 'dexScanner週間投票数' },
  { value: 'login_weekly',            label: '週間ログイン日数' },
  { value: 'weekly_clears_weekly',    label: '週間ウィークリーミッション達成数' },
  { value: 'monthly_points',          label: '累計ポイント保有数' },
  { value: 'total_clears',            label: '累計ミッションクリア回数' },
  { value: 'daily_clears_total',      label: 'デイリーミッションクリア累計' },
  { value: 'weekly_clears_total',     label: 'ウィークリーミッションクリア累計' },
  { value: 'achievement_clears_total',label: 'アチーブメント達成数' },
]

type MissionRow = {
  id: number
  title: string
  description: string | null
  type: string
  points: number
  startAt: string | null
  endAt: string | null
  linkUrl: string | null
  isActive: boolean
  createdAt: string
  conditionType: string | null
  conditionValue: string | null
  prerequisiteMissionId: number | null
  prerequisiteConditionType: string | null
  prerequisiteConditionValue: string | null
  displayOrder: number
}

type TxRow = {
  id: number
  userId: string
  type: string
  amount: string
  memo: string | null
  counterparty: string | null
  createdAt: string
}

type EmergencyRow = {
  userId: string
  displayName: string
  passwordEnabled: boolean
  passcodeEnabled: boolean
  updatedAt: string | null
}

type PurchaseRequestAdminRow = {
  id: number
  userId: string
  displayName: string | null
  solWallet: string | null
  amount: string
  txHash: string | null
  comment: string | null
  status: string
  rebateAmount: string | null
  rebateRate: string | null
  adminNote: string | null
  rebateTxSignature: string | null
  reviewedAt: string | null
  createdAt: string
}

type SystemSettingRow = {
  key: string
  value: string
  description: string | null
  updatedAt: string
}

const PR_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: '審査中',   color: 'text-yellow-500' },
  approved: { label: '承認済み', color: 'text-green-500' },
  rejected: { label: '却下',     color: 'text-destructive' },
}

const SYSTEM_SETTING_PRESETS: Record<string, string[]> = {
  purchase_request_limit: ['100000', '500000', '1000000', '5000000'],
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error ?? 'Error')
  }
  if (res.headers.get('content-type')?.includes('text/csv')) return res.text()
  return res.json()
}

const TX_TYPE_LABEL: Record<string, string> = {
  deposit: '入金',
  withdraw: '出金',
  send: '送金',
  receive: '受取',
  reward: '報酬',
  airdrop: 'エアドロップ',
  inmu_send: 'INMU送金',
  points_send: 'ポイント送金',
  points_deduct: 'ポイント減算',
}

const TX_INCOME_TYPES = ['deposit', 'receive', 'reward', 'airdrop', 'inmu_send', 'points_send']

function UserDetailDialog({
  user,
  onClose,
  onDelete,
}: {
  user: UserRow
  onClose: () => void
  onDelete: (userId: string) => Promise<void>
}) {
  const [txs, setTxs] = useState<TxRow[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [onChainBalance, setOnChainBalance] = useState<string | null>(null)
  const [balanceStatus, setBalanceStatus] = useState<'loading' | 'no-wallet' | 'ok' | 'error'>('loading')

  useEffect(() => {
    setTxLoading(true)
    fetch(`/api/admin/user-transactions?userId=${encodeURIComponent(user.userId)}`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(d => { setTxs(Array.isArray(d) ? d : []) })
      .catch(() => setTxs([]))
      .finally(() => setTxLoading(false))
  }, [user.userId])

  useEffect(() => {
    if (!user.solWallet) {
      setBalanceStatus('no-wallet')
      return
    }
    setBalanceStatus('loading')
    fetch(`/api/admin/solana/inmu-balance?wallet=${encodeURIComponent(user.solWallet)}`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then((d: { balance?: number | string; error?: string }) => {
        if (d.error || d.balance === undefined) {
          setBalanceStatus('error')
        } else {
          setOnChainBalance(String(d.balance))
          setBalanceStatus('ok')
        }
      })
      .catch(() => setBalanceStatus('error'))
  }, [user.userId, user.solWallet])

  const fmtLastLogin = (dt: string | null) => {
    if (!dt) return null
    return new Date(dt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          <User className="size-4 text-primary" />
          {user.displayName}
          {user.role === 'admin' && <Shield className="size-3 text-primary" />}
        </DialogTitle>
        {user.lastLogin && (
          <p className="text-[11px] text-muted-foreground pl-6">
            最終ログイン：{fmtLastLogin(user.lastLogin)}
          </p>
        )}
      </DialogHeader>

      <div className="flex flex-col gap-4 pt-1">
        {/* ── ユーザー詳細情報 ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">INMU残高（実残高）</p>
            {balanceStatus === 'loading' && (
              <p className="font-mono text-sm mt-0.5 text-muted-foreground">取得中…</p>
            )}
            {balanceStatus === 'no-wallet' && (
              <p className="text-sm mt-0.5 text-muted-foreground">未登録</p>
            )}
            {balanceStatus === 'error' && (
              <p className="text-sm mt-0.5 text-destructive">取得失敗</p>
            )}
            {balanceStatus === 'ok' && onChainBalance !== null && (
              <p className="font-mono font-bold text-sm mt-0.5">{formatInmu(onChainBalance)}</p>
            )}
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">ポイント数（累計）</p>
            <p className="font-mono font-bold text-sm mt-0.5">{Number(user.totalPoints).toLocaleString()} pt</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">アチーブメント達成数</p>
            <p className="font-mono font-bold text-sm mt-0.5">{user.achievementCount} 件</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">累計ログイン日数</p>
            <p className="font-mono font-bold text-sm mt-0.5">{user.totalLoginDays} 日</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">連続ログイン日数</p>
            <p className="font-mono font-bold text-sm mt-0.5">{user.loginStreak} 日</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">直近ログイン日時</p>
            <p className="font-mono font-bold text-xs mt-0.5">{fmtLastLogin(user.lastLogin) ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-green-500/10 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="size-3 text-green-500" />累計購入INMU</p>
            <p className="font-mono font-bold text-sm mt-0.5 text-green-600 dark:text-green-400">{formatInmu(user.totalBought ?? '0')}</p>
            {user.lastBuyAt && <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(user.lastBuyAt).toLocaleDateString('ja-JP')}</p>}
          </div>
          <div className="rounded-lg bg-red-500/10 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingDown className="size-3 text-red-500" />累計売却INMU</p>
            <p className="font-mono font-bold text-sm mt-0.5 text-red-500">{formatInmu(user.totalSold ?? '0')}</p>
            {user.lastSellAt && <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(user.lastSellAt).toLocaleDateString('ja-JP')}</p>}
          </div>
        </div>

        {/* SOLアドレス */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 mb-1">
            <WalletCards className="size-3.5 text-primary" />
            <p className="text-xs font-medium">SOLアドレス</p>
          </div>
          {user.solWallet ? (
            <p className="font-mono text-[11px] break-all text-foreground">{user.solWallet}</p>
          ) : (
            <p className="text-xs text-muted-foreground">未設定</p>
          )}
        </div>

        {/* ── 入出金履歴 ── */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-3">
            <History className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">入出金履歴（直近50件）</p>
          </div>
          {txLoading ? (
            <p className="text-xs text-center text-muted-foreground py-4">読み込み中…</p>
          ) : txs.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-4">履歴なし</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {txs.map(tx => {
                const isIncome = TX_INCOME_TYPES.includes(tx.type)
                return (
                  <div key={tx.id} className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs font-medium ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                        {TX_TYPE_LABEL[tx.type] ?? tx.type}
                      </span>
                      {tx.memo && (
                        <span className="text-[10px] text-muted-foreground">{tx.memo}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <span className={`font-mono text-sm font-bold shrink-0 ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {isIncome ? '+' : '-'}{formatInmu(tx.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── ユーザー削除 ── */}
        <div className="border-t border-border pt-3">
          {!confirmDelete ? (
            <Button
              variant="outline"
              className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              このユーザーを削除
            </Button>
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-destructive text-center">
                「{user.displayName}」を完全に削除しますか？<br />
                <span className="text-[10px] text-muted-foreground">全データが削除されます。この操作は取り消せません。</span>
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteLoading}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 gap-1"
                  disabled={deleteLoading}
                  onClick={async () => {
                    setDeleteLoading(true)
                    try {
                      await onDelete(user.userId)
                    } finally {
                      setDeleteLoading(false)
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                  {deleteLoading ? '削除中…' : '削除する'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  )
}

export function AdminPanel({ users, onRefresh }: { users: UserRow[]; onRefresh: () => void }) {
  const { t } = useI18n()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailUser, setDetailUser] = useState<UserRow | null>(null)

  const [bulkAmount, setBulkAmount] = useState('')

  const [bulkReason, setBulkReason] = useState('')
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMsg, setNotifMsg] = useState('')
  const [pointsAmount, setPointsAmount] = useState('')
  const [deductPointsAmount, setDeductPointsAmount] = useState('')
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [missionForm, setMissionForm] = useState({ title: '', description: '', type: 'daily', points: '', startAt: '', endAt: '', linkUrl: '', conditionType: 'none', conditionValue: '' })
  const [chainMode, setChainMode] = useState(false)
  const [chainStages, setChainStages] = useState([
    { title: '', description: '', points: '', conditionValue: '' },
    { title: '', description: '', points: '', conditionValue: '' },
  ])
  const [selectedMissionIds, setSelectedMissionIds] = useState<Set<number>>(new Set())
  const [editingMissionId, setEditingMissionId] = useState<number | null>(null)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [reorderCategory, setReorderCategory] = useState<string>('daily')
  const [localOrders, setLocalOrders] = useState<Record<number, number>>({})
  const [orderDirty, setOrderDirty] = useState(false)
  const [orderSaving, setOrderSaving] = useState(false)

  const [airdropAllAmount, setAirdropAllAmount] = useState('')
  const [airdropAllMemo, setAirdropAllMemo] = useState('')
  const [pointsAllAmount, setPointsAllAmount] = useState('')
  const [pointsAllReason, setPointsAllReason] = useState('')

  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)

  const [tradeRows, setTradeRows] = useState<TradeTxRow[]>([])
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeFetched, setTradeFetched] = useState(false)
  const [tradeUserFilter, setTradeUserFilter] = useState('')
  const [tradeScanning, setTradeScanning] = useState<string | null>(null)

  const [emergencyList, setEmergencyList] = useState<EmergencyRow[]>([])

  // ── 購入申請 ──
  const [purchaseReqs, setPurchaseReqs] = useState<PurchaseRequestAdminRow[]>([])
  const [prLoading, setPrLoading] = useState(false)
  const [prEditId, setPrEditId] = useState<number | null>(null)
  const [prStatus, setPrStatus] = useState('approved')
  const [prRebateAmount, setPrRebateAmount] = useState('')
  const [prRebateRate, setPrRebateRate] = useState('')
  const [prAdminNote, setPrAdminNote] = useState('')
  const [prSaving, setPrSaving] = useState(false)

  // Phantomブラウザへのリダイレクト後にフォーム状態を復元
  useEffect(() => {
    if (!getPhantom()) return
    try {
      const raw = sessionStorage.getItem(PHANTOM_PENDING_KEY)
      if (!raw) return
      sessionStorage.removeItem(PHANTOM_PENDING_KEY)
      const saved = JSON.parse(raw) as { id: number; status: string; rebateAmount: string; rebateRate: string; adminNote: string }
      setPrEditId(saved.id)
      setPrStatus(saved.status ?? 'approved')
      setPrRebateAmount(saved.rebateAmount ?? '')
      setPrRebateRate(saved.rebateRate ?? '')
      setPrAdminNote(saved.adminNote ?? '')
      toast.info('Phantomブラウザで再開しました。「保存」を押して署名してください。', { duration: 6000 })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!getPhantom()) return
    try {
      const raw = sessionStorage.getItem(PHANTOM_PENDING_AIRDROP_KEY)
      if (!raw) return
      sessionStorage.removeItem(PHANTOM_PENDING_AIRDROP_KEY)
      const saved = JSON.parse(raw) as { userIds: string[]; amount: number; memo: string }
      const targets = users.filter(u => saved.userIds.includes(u.userId))
      if (targets.length > 0 && saved.amount > 0) {
        toast.info(`Phantomブラウザで再開しました。${targets.length}名への送金を再開します…`, { duration: 4000 })
        setTimeout(() => handlePhantomAirdropSend(targets, saved.amount, saved.memo), 1500)
      }
    } catch { /* ignore */ }
  }, [users])

  // ── システム設定 ──
  const [systemSettings, setSystemSettings] = useState<SystemSettingRow[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null)
  const [settingEditValue, setSettingEditValue] = useState('')
  const [settingSaving, setSettingSaving] = useState(false)
  const [emergencySearch, setEmergencySearch] = useState('')
  const [emergencyUserId, setEmergencyUserId] = useState<string | null>(null)
  const [emergencyForm, setEmergencyForm] = useState({ password: '', passcode: '', passwordEnabled: false, passcodeEnabled: false })
  const [emergencySaving, setEmergencySaving] = useState(false)
  const [confirmOp, setConfirmOp] = useState<{ label: string; fn: () => Promise<void> } | null>(null)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeLoading, setPasscodeLoading] = useState(false)

  async function handleConfirmPasscode() {
    if (!confirmOp || !passcodeInput) return
    setPasscodeLoading(true)
    try {
      await api('/admin/verify-code', 'POST', { code: passcodeInput })
      setPasscodeInput('')
      setConfirmOp(null)
      await confirmOp.fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'パスコードが違います')
    } finally {
      setPasscodeLoading(false)
    }
  }

  function withConfirm(label: string, fn: () => Promise<void>) {
    setPasscodeInput('')
    setConfirmOp({ label, fn })
  }

  const filtered = users.filter(u =>
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    (u.solWallet ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const allSelected = filtered.length > 0 && filtered.every(u => selected.has(u.userId))
  const selectedIds = Array.from(selected)

  function toggleUser(userId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map(u => u.userId)))
  }

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true)
    try {
      await fn()
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handlePhantomAirdropSend(targetUsers: UserRow[], amount: number, memo: string) {
    const walletUsers = targetUsers.filter(u => u.solWallet)
    const noWalletUsers = targetUsers.filter(u => !u.solWallet)

    if (walletUsers.length === 0) {
      toast.error(
        noWalletUsers.length === 1
          ? `送金できません：選択中のユーザーはSOLアドレスが未設定です`
          : `送金できません：選択中の${noWalletUsers.length}名全員がSOLアドレス未設定です`,
      )
      return
    }

    const phantom = getPhantom()
    if (!phantom) {
      try {
        sessionStorage.setItem(PHANTOM_PENDING_AIRDROP_KEY, JSON.stringify({
          userIds: targetUsers.map(u => u.userId),
          amount,
          memo,
        }))
      } catch { /* ignore */ }
      if (isMobile()) {
        toast.info('Phantomアプリに切り替えています…')
        setTimeout(() => openPhantomBrowser(), 600)
      } else {
        toast.error('Phantom ウォレットが見つかりません。Phantom拡張機能をインストールしてください。', {
          action: { label: 'Phantomをインストール', onClick: () => window.open('https://phantom.app/', '_blank') },
          duration: 8000,
        })
      }
      return
    }

    let onchainSuccess = 0
    const rawAmount = Math.floor(amount * Math.pow(10, INMU_DECIMALS))
    const connection = new Connection(getAdminRpcUrl(), 'confirmed')

    try {
      toast.loading('Phantom に接続しています…', { id: 'ph-airdrop-connect' })
      const resp = await phantom.connect()
      const adminWalletStr = resp.publicKey.toString()
      toast.dismiss('ph-airdrop-connect')
      const fromPubkey = new PublicKey(adminWalletStr)
      const fromATA = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, fromPubkey, false, TOKEN_2022_PROGRAM_ID)

      const chunks: UserRow[][] = []
      for (let i = 0; i < walletUsers.length; i += AIRDROP_CHUNK_SIZE) {
        chunks.push(walletUsers.slice(i, i + AIRDROP_CHUNK_SIZE))
      }

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci]
        const chunkLabel = chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ''
        const instrs: Parameters<typeof Transaction.prototype.add>[0][] = []

        for (const u of chunk) {
          const toPubkey = new PublicKey(u.solWallet!)
          const toATA = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, toPubkey, false, TOKEN_2022_PROGRAM_ID)
          instrs.push(createAssociatedTokenAccountIdempotentInstruction(fromPubkey, toATA, toPubkey, INMU_MINT_PUBKEY, TOKEN_2022_PROGRAM_ID))
          instrs.push(createTransferInstruction(fromATA, toATA, fromPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID))
        }

        const tx = new Transaction()
        tx.add(...instrs)
        tx.feePayer = fromPubkey
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
        tx.recentBlockhash = blockhash

        toast.loading(`Phantom で署名してください${chunkLabel}…`, { id: 'ph-airdrop-sign' })
        const signedTx = await phantom.signTransaction(tx)
        toast.dismiss('ph-airdrop-sign')

        toast.loading(`Solana へ送信中${chunkLabel}…`, { id: 'ph-airdrop-send' })
        const signature = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false, maxRetries: 3 })
        toast.dismiss('ph-airdrop-send')

        try { await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed') } catch { /* best-effort */ }

        await api('/admin/record-airdrop-batch', 'POST', {
          users: chunk.map(u => ({ userId: u.userId, wallet: u.solWallet })),
          amount,
          txSignature: signature,
          memo,
        })
        onchainSuccess += chunk.length
      }
    } catch (e: unknown) {
      toast.dismiss('ph-airdrop-connect')
      toast.dismiss('ph-airdrop-sign')
      toast.dismiss('ph-airdrop-send')
      const msg = e instanceof Error ? e.message : '不明なエラー'
      if (msg !== 'User rejected the request.') toast.error(`Phantom 送金失敗: ${msg}`)
      return
    }

    if (noWalletUsers.length > 0) {
      toast.warning(`${noWalletUsers.length}名はSOLアドレス未設定のためスキップしました`)
    }

    toast.success(`オンチェーン送金完了: ${onchainSuccess}名 × ${amount.toLocaleString()} INMU`)
  }

  async function deleteUser(userId: string) {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? '削除失敗')
    toast.success('ユーザーを削除しました')
    setDetailUser(null)
    onRefresh()
  }

  async function handleDownloadBackup() {
    setLoading(true)
    try {
      const csv = await api('/admin/backup-csv', 'GET')
      const blob = new Blob([csv as string], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'inmu-backup.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function loadAuditLog() {
    try {
      const data = await api('/admin/audit', 'GET') as AuditRow[]
      setAuditLogs(data)
    } catch {
      toast.error(t('error'))
    }
  }

  async function loadMissions() {
    try {
      const data = await api('/admin/missions', 'GET') as MissionRow[]
      setMissions(data.filter((m: MissionRow) => m.isActive !== false))
      const orders: Record<number, number> = {}
      data.forEach(m => { orders[m.id] = m.displayOrder ?? 0 })
      setLocalOrders(orders)
      setOrderDirty(false)
    } catch {
      toast.error(t('error'))
    }
  }

  async function saveReorder() {
    setOrderSaving(true)
    try {
      const orders = Object.entries(localOrders).map(([id, displayOrder]) => ({ id: Number(id), displayOrder }))
      await api('/admin/missions/reorder', 'PUT', { orders })
      toast.success('表示順を保存しました')
      setOrderDirty(false)
      await loadMissions()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setOrderSaving(false)
    }
  }

  function moveUp(id: number, catMissions: MissionRow[]) {
    const sorted = [...catMissions].sort((a, b) => (localOrders[a.id] ?? 0) - (localOrders[b.id] ?? 0))
    const idx = sorted.findIndex(m => m.id === id)
    if (idx <= 0) return
    const prev = sorted[idx - 1]
    const tmpOrder = localOrders[id] ?? 0
    setLocalOrders(prev2 => ({
      ...prev2,
      [id]: localOrders[prev.id] ?? 0,
      [prev.id]: tmpOrder,
    }))
    setOrderDirty(true)
  }

  function moveDown(id: number, catMissions: MissionRow[]) {
    const sorted = [...catMissions].sort((a, b) => (localOrders[a.id] ?? 0) - (localOrders[b.id] ?? 0))
    const idx = sorted.findIndex(m => m.id === id)
    if (idx < 0 || idx >= sorted.length - 1) return
    const next = sorted[idx + 1]
    const tmpOrder = localOrders[id] ?? 0
    setLocalOrders(prev2 => ({
      ...prev2,
      [id]: localOrders[next.id] ?? 0,
      [next.id]: tmpOrder,
    }))
    setOrderDirty(true)
  }

  const loadTradeHistory = useCallback(async (force = false) => {
    if (tradeFetched && !force) return
    setTradeLoading(true)
    try {
      const data = await api('/admin/trade-history?limit=200', 'GET') as TradeTxRow[]
      setTradeRows(Array.isArray(data) ? data : [])
      setTradeFetched(true)
    } catch {
      toast.error(t('error'))
    } finally {
      setTradeLoading(false)
    }
  }, [tradeFetched, t])

  async function handleAdminScan(userId: string) {
    setTradeScanning(userId)
    try {
      const result = await api('/admin/solana/scan-trades', 'POST', { targetUserId: userId }) as { added: number; total: number }
      toast.success(`${result.added}件の新規取引（合計${result.total}件）`)
      await loadTradeHistory(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setTradeScanning(null)
    }
  }

  async function loadPurchaseRequests() {
    setPrLoading(true)
    try {
      const data = await api('/admin/purchase-requests', 'GET') as PurchaseRequestAdminRow[]
      setPurchaseReqs(Array.isArray(data) ? data : [])
    } catch { toast.error(t('error')) }
    finally { setPrLoading(false) }
  }

  async function savePurchaseReview(id: number) {
    setPrSaving(true)
    let rebateTxSignature: string | null = null
    try {
      const pr = purchaseReqs.find(r => r.id === id)
      const numRebate = prRebateAmount ? Number(prRebateAmount) : 0

      if (prStatus === 'approved' && numRebate > 0) {
        if (!pr?.solWallet) {
          toast.error('ユーザーのウォレットアドレスが未設定です')
          setPrSaving(false)
          return
        }
        const phantom = getPhantom()
        if (!phantom) {
          // Save form state so it can be restored after Phantom redirect
          try {
            sessionStorage.setItem(PHANTOM_PENDING_KEY, JSON.stringify({
              id,
              status: prStatus,
              rebateAmount: prRebateAmount,
              rebateRate: prRebateRate,
              adminNote: prAdminNote,
            }))
          } catch { /* ignore */ }
          setPrSaving(false)
          if (isMobile()) {
            toast.info('Phantomアプリに切り替えています…')
            setTimeout(() => openPhantomBrowser(), 600)
          } else {
            toast.error('Phantom ウォレットが見つかりません。Phantom拡張機能をインストールしてください。', {
              action: {
                label: 'Phantomをインストール',
                onClick: () => window.open('https://phantom.app/', '_blank'),
              },
              duration: 8000,
            })
          }
          return
        }
        try {
          toast.loading('Phantom に接続しています…', { id: 'ph-admin' })
          const resp = await phantom.connect()
          const adminWallet = resp.publicKey.toString()
          toast.dismiss('ph-admin')

          const INMU_MINT_KEY = new PublicKey('4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump')
          const INMU_DEC = 6
          const connection = new Connection(getAdminRpcUrl(), 'confirmed')
          const fromPubkey = new PublicKey(adminWallet)
          const toPubkey = new PublicKey(pr.solWallet)

          const fromATA = await getAssociatedTokenAddress(INMU_MINT_KEY, fromPubkey, false, TOKEN_2022_PROGRAM_ID)
          const toATA   = await getAssociatedTokenAddress(INMU_MINT_KEY, toPubkey,   false, TOKEN_2022_PROGRAM_ID)
          const instrs: Parameters<typeof Transaction.prototype.add>[0][] = []
          try { await getAccount(connection, toATA, 'confirmed', TOKEN_2022_PROGRAM_ID) }
          catch { instrs.push(createAssociatedTokenAccountInstruction(fromPubkey, toATA, toPubkey, INMU_MINT_KEY, TOKEN_2022_PROGRAM_ID)) }

          const rawAmount = Math.floor(numRebate * Math.pow(10, INMU_DEC))
          instrs.push(createTransferInstruction(fromATA, toATA, fromPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID))

          const tx = new Transaction()
          tx.add(...instrs)
          tx.feePayer = fromPubkey
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
          tx.recentBlockhash = blockhash

          toast.loading('Phantom で署名してください…', { id: 'ph-sign' })
          const signedTx = await phantom.signTransaction(tx)
          toast.dismiss('ph-sign')

          toast.loading('Solana へ送信中…', { id: 'ph-send' })
          const signature = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false, maxRetries: 3 })
          toast.dismiss('ph-send')
          rebateTxSignature = signature

          try { await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed') } catch { /* best-effort */ }
          toast.success(`オンチェーン送金完了: ${numRebate.toLocaleString()} INMU → ${pr.displayName ?? pr.userId}`)
        } catch (e: unknown) {
          toast.dismiss('ph-admin'); toast.dismiss('ph-sign'); toast.dismiss('ph-send')
          const msg = e instanceof Error ? e.message : '不明なエラー'
          if (msg !== 'User rejected the request.') toast.error(`Phantom 送金失敗: ${msg}`)
          setPrSaving(false)
          return
        }
      }

      await api(`/admin/purchase-requests/${id}`, 'PUT', {
        status: prStatus,
        rebateAmount: prRebateAmount ? Number(prRebateAmount) : null,
        rebateRate:   prRebateRate   ? Number(prRebateRate)   : null,
        adminNote: prAdminNote || null,
        rebateTxSignature,
      })
      toast.success('更新しました')
      setPrEditId(null)
      setPrStatus('approved')
      setPrRebateAmount('')
      setPrRebateRate('')
      setPrAdminNote('')
      await loadPurchaseRequests()
    } catch (e) { toast.error(e instanceof Error ? e.message : t('error')) }
    finally { setPrSaving(false) }
  }

  async function loadSystemSettings() {
    setSettingsLoading(true)
    try {
      const data = await api('/admin/system-settings', 'GET') as SystemSettingRow[]
      setSystemSettings(Array.isArray(data) ? data : [])
    } catch { toast.error(t('error')) }
    finally { setSettingsLoading(false) }
  }

  async function saveSystemSetting(key: string) {
    setSettingSaving(true)
    try {
      await api(`/admin/system-settings/${key}`, 'PUT', { value: settingEditValue })
      toast.success('設定を保存しました')
      setEditingSettingKey(null)
      setSettingEditValue('')
      await loadSystemSettings()
    } catch (e) { toast.error(e instanceof Error ? e.message : t('error')) }
    finally { setSettingSaving(false) }
  }

  async function bulkDeleteMissions() {
    if (selectedMissionIds.size === 0) return
    const ids = Array.from(selectedMissionIds)
    await withLoading(async () => {
      await Promise.all(ids.map(id => api(`/admin/missions/${id}`, 'DELETE')))
      setSelectedMissionIds(new Set())
      await loadMissions()
      toast.success(`${ids.length}件のミッションを削除しました`)
    })
  }

  async function saveMission() {
    const { title, description, type, points, startAt, endAt, linkUrl, conditionType, conditionValue } = missionForm

    // Chain mode: create a staged unlock chain
    if (chainMode && editingMissionId === null) {
      if (chainStages.some(s => !s.title.trim())) { toast.error('各ステージにタイトルが必要です'); return }
      const noValueTypes = new Set(['none', 'link_visit', 'follow_x', 'join_discord'])
      const condTypeVal = conditionType === 'none' ? null : conditionType
      try {
        await api('/admin/missions/chain', 'POST', {
          type,
          conditionType: condTypeVal,
          linkUrl: linkUrl || null,
          startAt: startAt || null,
          endAt: endAt || null,
          stages: chainStages.map(s => ({
            title: s.title.trim(),
            description: s.description.trim() || null,
            points: Number(s.points) || 0,
            conditionValue: (condTypeVal && !noValueTypes.has(condTypeVal) && s.conditionValue)
              ? Number(s.conditionValue)
              : null,
          })),
        })
        setMissionForm({ title: '', description: '', type: 'daily', points: '', startAt: '', endAt: '', linkUrl: '', conditionType: 'none', conditionValue: '' })
        setChainStages([
          { title: '', description: '', points: '', conditionValue: '' },
          { title: '', description: '', points: '', conditionValue: '' },
        ])
        setChainMode(false)
        await loadMissions()
        toast.success(`${chainStages.length}ステージのチェーンを作成しました`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('error'))
      }
      return
    }

    if (!title.trim()) { toast.error('タイトルが必要です'); return }
    const noValueTypes = new Set(['none', 'link_visit', 'follow_x', 'join_discord'])
    const condTypeVal = conditionType === 'none' ? null : conditionType
    const condValueVal = condTypeVal && !noValueTypes.has(condTypeVal) && conditionValue ? Number(conditionValue) : null
    const payload = {
      title, description, type, points: Number(points) || 0,
      startAt: startAt || null, endAt: endAt || null, linkUrl: linkUrl || null,
      conditionType: condTypeVal, conditionValue: condValueVal,
    }
    try {
      if (editingMissionId !== null) {
        await api(`/admin/missions/${editingMissionId}`, 'PUT', payload)
      } else {
        await api('/admin/missions', 'POST', payload)
      }
      setMissionForm({ title: '', description: '', type: 'daily', points: '', startAt: '', endAt: '', linkUrl: '', conditionType: 'none', conditionValue: '' })
      setEditingMissionId(null)
      await loadMissions()
      toast.success('保存しました')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-primary">
        <Shield className="size-4" />
        <p className="text-sm font-medium">{t('admin_only')}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('search')}
          className="min-h-11 pl-9"
        />
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-4 h-auto gap-0.5">
          <TabsTrigger value="users" className="text-xs py-1.5">Users</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs py-1.5">Actions</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs py-1.5">Audit</TabsTrigger>
          <TabsTrigger value="missions" className="text-xs py-1.5" onClick={loadMissions}>Mission</TabsTrigger>
          <TabsTrigger value="emergency" className="text-xs py-1.5" onClick={async () => {
            try { const d = await api('/admin/emergency-auth', 'GET'); setEmergencyList(Array.isArray(d) ? d : []) } catch { setEmergencyList([]) }
          }}>緊急</TabsTrigger>
          <TabsTrigger value="trade" className="text-xs py-1.5" onClick={() => loadTradeHistory()}>売買</TabsTrigger>
          <TabsTrigger value="purchase" className="text-xs py-1.5" onClick={loadPurchaseRequests}>
            <ShoppingCart className="size-3 mr-1" />申請
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs py-1.5" onClick={loadSystemSettings}>
            <Settings className="size-3 mr-1" />設定
          </TabsTrigger>
        </TabsList>

        {/* ── Users tab ── */}
        <TabsContent value="users" className="flex flex-col gap-3 mt-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {allSelected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
              全選択 ({selected.size}/{filtered.length})
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                選択解除
              </button>
            )}
          </div>

          {filtered.map(u => {
            const lastLoginFmt = u.lastLogin
              ? new Date(u.lastLogin).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              : null
            return (
              <Card
                key={u.userId}
                className={`border-border bg-card p-3 cursor-pointer transition-colors hover:bg-secondary/30 ${
                  selected.has(u.userId) ? 'bg-primary/5 border-primary/30' : ''
                }`}
                onClick={() => setDetailUser(u)}
              >
                <div className="flex items-center gap-3">
                  <div onClick={e => { e.stopPropagation(); toggleUser(u.userId) }}>
                    {selected.has(u.userId)
                      ? <CheckSquare className="size-4 text-primary" />
                      : <Square className="size-4 text-muted-foreground" />}
                  </div>
                  <div className="flex flex-1 min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{u.displayName}</span>
                      {u.role === 'admin' && <Shield className="size-3 text-primary shrink-0" />}
                    </div>
                    {lastLoginFmt && (
                      <p className="text-[10px] text-muted-foreground pl-6">最終ログイン：{lastLoginFmt}</p>
                    )}
                  </div>
                  <span className="font-mono text-sm font-bold shrink-0">{formatInmu(u.balance)}</span>
                </div>
                <div className="mt-1.5 pl-7 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    参加: {u.participationCount}
                  </span>
                  {u.solWallet ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <WalletCards className="size-3 text-green-500" />
                      {maskWallet(u.solWallet)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">SOL未設定</span>
                  )}
                </div>
              </Card>
            )
          })}

          <Button
            onClick={handleDownloadBackup}
            variant="outline"
            className="min-h-11 gap-2 mt-2"
            disabled={loading}
          >
            <Download className="size-4" />
            {t('backup')} (CSV)
          </Button>
        </TabsContent>

        {/* ── Actions tab ── */}
        <TabsContent value="actions" className="flex flex-col gap-4 mt-3">

          {/* 全体配布 */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col gap-4">
            <p className="text-sm font-semibold text-primary flex items-center gap-2">
              <Star className="size-4" />
              全体配布
            </p>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Coins className="size-3" /> 全員INMU送金
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="配布量 / 人"
                  value={airdropAllAmount}
                  onChange={e => setAirdropAllAmount(e.target.value)}
                  className="min-h-10 flex-1"
                />
                <Button
                  onClick={() => withConfirm('全員INMU送金', () => withLoading(async () => {
                    const amount = Number(airdropAllAmount)
                    const memo = airdropAllMemo || 'INMU送金'
                    await handlePhantomAirdropSend(users, amount, memo)
                    setAirdropAllAmount('')
                    setAirdropAllMemo('')
                  }))}
                  disabled={loading || !airdropAllAmount}
                  className="min-h-10"
                >
                  送金
                </Button>
              </div>
              <Input
                placeholder="メモ（任意）"
                value={airdropAllMemo}
                onChange={e => setAirdropAllMemo(e.target.value)}
                className="min-h-10"
              />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Star className="size-3" /> 全員ポイント送金
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="付与ポイント"
                  value={pointsAllAmount}
                  onChange={e => setPointsAllAmount(e.target.value)}
                  className="min-h-10 flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => withConfirm('全員ポイント送金', () => withLoading(async () => {
                    const d = await api('/admin/grant-points-all', 'POST', {
                      amount: Number(pointsAllAmount),
                      reason: pointsAllReason || 'ポイント送金',
                    }) as { count: number }
                    toast.success(`${d.count}名にポイント送金完了`)
                    setPointsAllAmount('')
                    setPointsAllReason('')
                  }))}
                  disabled={loading || !pointsAllAmount}
                  className="min-h-10"
                >
                  送金
                </Button>
              </div>
              <Input
                placeholder="理由（任意）"
                value={pointsAllReason}
                onChange={e => setPointsAllReason(e.target.value)}
                className="min-h-10"
              />
            </div>
          </div>

          {/* 選択ユーザー操作 */}
          {selected.size > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="size-4 text-primary" />
                {selected.size}名選択中
              </p>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Coins className="size-3" /> INMU送金（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="配布量"
                    value={bulkAmount}
                    onChange={e => setBulkAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    onClick={() => withConfirm('INMU送金', () => withLoading(async () => {
                      const targets = users.filter(u => selected.has(u.userId))
                      await handlePhantomAirdropSend(targets, Number(bulkAmount), bulkReason || 'INMU送金')
                    }))}
                    disabled={loading || !bulkAmount}
                    className="min-h-10"
                  >
                    送金
                  </Button>
                </div>
              </div>


              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Star className="size-3" /> ポイント送金（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="付与ポイント"
                    value={pointsAmount}
                    onChange={e => setPointsAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => withConfirm('ポイント送金', () => withLoading(() =>
                      api('/admin/grant-points', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(pointsAmount),
                        reason: bulkReason || 'ポイント送金',
                      })
                    ))}
                    disabled={loading || !pointsAmount}
                    className="min-h-10"
                  >
                    送金
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MinusCircle className="size-3 text-destructive" /> ポイント減算（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="減算ポイント"
                    value={deductPointsAmount}
                    onChange={e => setDeductPointsAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => withConfirm('ポイント減算', () => withLoading(async () => {
                      await api('/admin/deduct-points', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(deductPointsAmount),
                        reason: bulkReason || '管理者によるポイント減算',
                      })
                      toast.success(`${selectedIds.length}名からポイント減算完了`)
                      setDeductPointsAmount('')
                    }))}
                    disabled={loading || !deductPointsAmount}
                    className="min-h-10"
                  >
                    減算
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Send className="size-3" /> 通知送信（選択ユーザー）
                </p>
                <Input
                  placeholder="タイトル"
                  value={notifTitle}
                  onChange={e => setNotifTitle(e.target.value)}
                  className="min-h-10"
                />
                <Input
                  placeholder="メッセージ（任意）"
                  value={notifMsg}
                  onChange={e => setNotifMsg(e.target.value)}
                  className="min-h-10"
                />
                <Button
                  variant="outline"
                  onClick={() => withLoading(async () => {
                    await api('/admin/send-notification', 'POST', {
                      targetUserIds: selectedIds,
                      title: notifTitle,
                      message: notifMsg,
                    })
                    setNotifTitle('')
                    setNotifMsg('')
                  })}
                  disabled={loading || !notifTitle}
                  className="min-h-10 gap-2"
                >
                  <Send className="size-4" />送信
                </Button>
              </div>

              <Input
                placeholder="理由・メモ（共通）"
                value={bulkReason}
                onChange={e => setBulkReason(e.target.value)}
                className="min-h-10"
              />
            </div>
          )}

          {selected.size === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              Usersタブでユーザーをタップして詳細表示・選択
            </p>
          )}
        </TabsContent>

        {/* ── Missions tab ── */}
        <TabsContent value="missions" className="flex flex-col gap-4 mt-3">

          {/* 作成・編集フォーム */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-primary flex items-center gap-2">
              {editingMissionId !== null ? <Edit2 className="size-4" /> : <Plus className="size-4" />}
              {editingMissionId !== null ? 'ミッション編集' : 'ミッション作成'}
            </p>
            <div className="flex flex-col gap-2">
              <Input
                placeholder="タイトル *"
                value={missionForm.title}
                onChange={e => setMissionForm(f => ({ ...f, title: e.target.value }))}
                className="min-h-10"
              />
              <Input
                placeholder="説明（任意）"
                value={missionForm.description}
                onChange={e => setMissionForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-10"
              />
              <div className="flex gap-2">
                <select
                  value={missionForm.type}
                  onChange={e => setMissionForm(f => ({ ...f, type: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring flex-1"
                >
                  <option value="daily">デイリー</option>
                  <option value="weekly">ウィークリー</option>
                  <option value="achievement">アチーブメント（恒久）</option>
                  <option value="event">イベント（期間限定）</option>
                </select>
                <Input
                  type="number"
                  placeholder="ポイント"
                  value={missionForm.points}
                  onChange={e => setMissionForm(f => ({ ...f, points: e.target.value }))}
                  className="min-h-10 flex-1"
                />
              </div>
              <Input
                placeholder="リンクURL（任意）"
                value={missionForm.linkUrl}
                onChange={e => setMissionForm(f => ({ ...f, linkUrl: e.target.value }))}
                className="min-h-10"
              />
              {/* 条件設定 */}
              <div className="flex gap-2">
                <select
                  value={missionForm.conditionType}
                  onChange={e => setMissionForm(f => ({ ...f, conditionType: e.target.value, conditionValue: '' }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring flex-1"
                >
                  {CONDITION_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {missionForm.conditionType !== 'none' && missionForm.conditionType !== 'link_visit' &&
                 missionForm.conditionType !== 'follow_x' && missionForm.conditionType !== 'join_discord' && !chainMode && (
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="条件値"
                    value={missionForm.conditionValue}
                    onChange={e => setMissionForm(f => ({ ...f, conditionValue: e.target.value }))}
                    className="min-h-10 flex-1"
                  />
                )}
              </div>

              {/* 段階解放チェーンモード（新規作成時のみ） */}
              {editingMissionId === null && (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={chainMode}
                      onChange={e => setChainMode(e.target.checked)}
                      className="accent-primary"
                    />
                    <span className="text-xs font-semibold text-primary">🔗 段階解放チェーンとして作成</span>
                  </label>
                  {chainMode && (
                    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="text-[11px] text-muted-foreground">各ステージのタイトル・説明・ポイント・条件値を設定。ステージ1を達成すると消えてステージ2が出現します。</p>
                      {chainStages.map((stage, i) => (
                        <div key={i} className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">ステージ {i + 1}</span>
                            {chainStages.length > 2 && (
                              <button
                                type="button"
                                className="text-[10px] text-destructive hover:underline"
                                onClick={() => setChainStages(s => s.filter((_, idx) => idx !== i))}
                              >削除</button>
                            )}
                          </div>
                          <Input
                            placeholder={`タイトル *`}
                            value={stage.title}
                            onChange={e => setChainStages(s => s.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                            className="min-h-9 text-sm"
                          />
                          <Input
                            placeholder="説明（任意）"
                            value={stage.description}
                            onChange={e => setChainStages(s => s.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))}
                            className="min-h-9 text-sm"
                          />
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="ポイント"
                              value={stage.points}
                              onChange={e => setChainStages(s => s.map((x, idx) => idx === i ? { ...x, points: e.target.value } : x))}
                              className="min-h-9 text-sm flex-1"
                            />
                            {missionForm.conditionType !== 'none' && missionForm.conditionType !== 'link_visit' &&
                             missionForm.conditionType !== 'follow_x' && missionForm.conditionType !== 'join_discord' && (
                              <Input
                                type="number"
                                placeholder="条件値"
                                value={stage.conditionValue}
                                onChange={e => setChainStages(s => s.map((x, idx) => idx === i ? { ...x, conditionValue: e.target.value } : x))}
                                className="min-h-9 text-sm flex-1"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline text-left"
                        onClick={() => setChainStages(s => [...s, { title: '', description: '', points: '', conditionValue: '' }])}
                      >+ ステージを追加</button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <Label className="text-xs text-muted-foreground">開始日時</Label>
                  <Input
                    type="datetime-local"
                    value={missionForm.startAt}
                    onChange={e => setMissionForm(f => ({ ...f, startAt: e.target.value }))}
                    className="min-h-10"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <Label className="text-xs text-muted-foreground">終了日時</Label>
                  <Input
                    type="datetime-local"
                    value={missionForm.endAt}
                    onChange={e => setMissionForm(f => ({ ...f, endAt: e.target.value }))}
                    className="min-h-10"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveMission} className="min-h-10 flex-1">
                  {editingMissionId !== null ? '更新' : '作成'}
                </Button>
                {editingMissionId !== null && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingMissionId(null)
                      setMissionForm({ title: '', description: '', type: 'daily', points: '', startAt: '', endAt: '', linkUrl: '', conditionType: 'none', conditionValue: '' })
                    }}
                    className="min-h-10"
                  >
                    キャンセル
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── 並び替え設定 ── */}
          {missions.length > 0 && (
            <div className="rounded-lg border border-border bg-secondary/10">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors rounded-lg"
                onClick={() => setReorderOpen(o => !o)}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">表示順の並び替え</span>
                  {orderDirty && (
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">未保存</span>
                  )}
                </div>
                {reorderOpen
                  ? <ArrowUp className="size-4 text-muted-foreground" />
                  : <ArrowDown className="size-4 text-muted-foreground" />}
              </button>

              {reorderOpen && (() => {
                const CATS = [
                  { value: 'daily',       label: 'デイリー' },
                  { value: 'weekly',      label: 'ウィークリー' },
                  { value: 'achievement', label: 'アチーブメント' },
                  { value: 'event',       label: 'イベント' },
                ]
                const catMissions = missions
                  .filter(m => m.type === reorderCategory && m.isActive)
                  .sort((a, b) => (localOrders[a.id] ?? 0) - (localOrders[b.id] ?? 0))
                return (
                  <div className="border-t border-border px-3 pb-3 pt-2 flex flex-col gap-3">
                    <div className="text-[11px] text-muted-foreground">
                      カテゴリ内で順番を変更できます。「上へ」「下へ」ボタンか番号入力後、「表示順を保存」してください。
                    </div>
                    {/* カテゴリ選択 */}
                    <div className="flex gap-1 flex-wrap">
                      {CATS.map(c => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setReorderCategory(c.value)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            reorderCategory === c.value
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {c.label}
                          <span className="ml-1 opacity-60">
                            ({missions.filter(m => m.type === c.value && m.isActive).length})
                          </span>
                        </button>
                      ))}
                    </div>

                    {catMissions.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        このカテゴリにはミッションがありません
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {catMissions.map((m, idx) => (
                          <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                            <span className="text-xs text-muted-foreground w-5 text-center font-mono shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveUp(m.id, catMissions)}
                                className="size-6 flex items-center justify-center rounded hover:bg-secondary disabled:opacity-30 transition-colors"
                              >
                                <ArrowUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === catMissions.length - 1}
                                onClick={() => moveDown(m.id, catMissions)}
                                className="size-6 flex items-center justify-center rounded hover:bg-secondary disabled:opacity-30 transition-colors"
                              >
                                <ArrowDown className="size-3.5" />
                              </button>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={localOrders[m.id] ?? 0}
                              onChange={e => {
                                setLocalOrders(prev => ({ ...prev, [m.id]: Number(e.target.value) }))
                                setOrderDirty(true)
                              }}
                              className="w-14 h-7 rounded border border-input bg-background px-2 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
                            />
                            <span className="text-sm flex-1 truncate min-w-0">{m.title}</span>
                            <span className="text-xs text-muted-foreground shrink-0">+{m.points}pts</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={saveReorder}
                      disabled={orderSaving || !orderDirty}
                      className="min-h-9 gap-2"
                    >
                      <GripVertical className="size-3.5" />
                      {orderSaving ? '保存中…' : '表示順を保存'}
                    </Button>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ミッション一覧 */}
          {missions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              ミッションがありません。上のフォームから作成してください。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox"
                    checked={selectedMissionIds.size === missions.filter(m => m.isActive).length && missions.filter(m => m.isActive).length > 0}
                    onChange={e => setSelectedMissionIds(e.target.checked ? new Set(missions.filter(m => m.isActive).map(m => m.id)) : new Set())} />
                  全選択（{selectedMissionIds.size}件選択中）
                </label>
                {selectedMissionIds.size > 0 && (
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
                    onClick={bulkDeleteMissions}>
                    <Trash2 className="size-3 mr-1" />選択削除（{selectedMissionIds.size}件）
                  </Button>
                )}
              </div>
              {missions.map(m => (
                <Card key={m.id} className={`border-border bg-card p-3 ${!m.isActive ? 'opacity-50' : ''} ${selectedMissionIds.has(m.id) ? 'ring-1 ring-primary/40' : ''}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1 shrink-0 cursor-pointer accent-primary"
                      checked={selectedMissionIds.has(m.id)}
                      onChange={e => setSelectedMissionIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(m.id); else next.delete(m.id); return next })} />
                  <div className="flex items-start justify-between gap-2 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                          m.type === 'weekly' ? 'bg-blue-500/20 text-blue-400' :
                          m.type === 'achievement' ? 'bg-yellow-500/20 text-yellow-400' :
                          m.type === 'event' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          {m.type === 'weekly' ? 'W' : m.type === 'achievement' ? 'A' : m.type === 'event' ? 'E' : 'D'}
                        </span>
                        <p className="text-sm font-medium truncate">{m.title}</p>
                        <span className="font-mono text-xs text-chart-5 shrink-0">+{m.points}pts</span>
                      </div>
                      {m.description && <p className="text-xs text-muted-foreground mt-0.5 ml-6">{m.description}</p>}
                      {m.conditionType && m.conditionType !== 'none' && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">
                          条件: {CONDITION_TYPE_OPTIONS.find(o => o.value === m.conditionType)?.label ?? m.conditionType}
                          {m.conditionValue && m.conditionType !== 'link_visit' ? ` — ${Number(m.conditionValue).toLocaleString()}` : ''}
                        </p>
                      )}
                      {m.prerequisiteMissionId && (
                        <p className="text-[10px] text-yellow-600 dark:text-yellow-400 mt-0.5 ml-6">
                          🔗 チェーン: ステージ {missions.findIndex(mx => mx.id === m.prerequisiteMissionId) + 1} 達成後に解放 (#{m.prerequisiteMissionId})
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        onClick={() => {
                          setEditingMissionId(m.id)
                          setChainMode(false)
                          setMissionForm({
                            title: m.title,
                            description: m.description ?? '',
                            type: m.type,
                            points: String(m.points),
                            startAt: m.startAt ? new Date(m.startAt).toISOString().slice(0, 16) : '',
                            endAt: m.endAt ? new Date(m.endAt).toISOString().slice(0, 16) : '',
                            linkUrl: m.linkUrl ?? '',
                            conditionType: m.conditionType ?? 'none',
                            conditionValue: m.conditionValue ?? '',
                          })
                        }}
                      >
                        <Edit2 className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        onClick={() => withLoading(async () => {
                          await api(`/admin/missions/${m.id}`, 'PUT', { isActive: !m.isActive })
                          await loadMissions()
                          toast.success(m.isActive ? '無効化しました' : '有効化しました')
                        })}
                      >
                        <History className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => withLoading(async () => {
                          await api(`/admin/missions/${m.id}`, 'DELETE')
                          await loadMissions()
                          toast.success('削除しました')
                        })}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Emergency Auth tab ── */}
        <TabsContent value="emergency" className="flex flex-col gap-4 mt-3">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <Lock className="size-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[11px] text-destructive/80">緊急認証はユーザーが通常の認証情報を使えない場合の予備手段です。有効化は慎重に行ってください。</p>
          </div>

          {/* ユーザー選択フォーム */}
          <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              ユーザー設定
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="ユーザー名で検索"
                value={emergencySearch}
                onChange={e => setEmergencySearch(e.target.value)}
                className="pl-8 min-h-10"
              />
            </div>
            {emergencySearch.trim() && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {users.filter(u => u.displayName.toLowerCase().includes(emergencySearch.toLowerCase())).map(u => (
                  <button
                    key={u.userId}
                    type="button"
                    onClick={async () => {
                      try {
                        const d = await api(`/admin/emergency-auth/${u.userId}`, 'GET')
                        setEmergencyForm({ password: '', passcode: '', passwordEnabled: d.passwordEnabled ?? false, passcodeEnabled: d.passcodeEnabled ?? false })
                        setEmergencyUserId(u.userId)
                        setEmergencySearch('')
                      } catch { toast.error('読み込みエラー') }
                    }}
                    className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2.5 text-left text-sm hover:bg-secondary/60"
                  >
                    <User className="size-3.5 text-muted-foreground shrink-0" />
                    {u.displayName}
                  </button>
                ))}
              </div>
            )}

            {emergencyUserId && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  対象: {users.find(u => u.userId === emergencyUserId)?.displayName ?? emergencyUserId}
                </p>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>緊急パスワード</span>
                    <button
                      type="button"
                      onClick={() => setEmergencyForm(f => ({ ...f, passwordEnabled: !f.passwordEnabled }))}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${emergencyForm.passwordEnabled ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-border text-muted-foreground'}`}
                    >
                      {emergencyForm.passwordEnabled ? '有効' : '無効'}
                    </button>
                  </Label>
                  <Input
                    type="password"
                    placeholder="新しい緊急パスワード（空白=変更なし）"
                    value={emergencyForm.password}
                    onChange={e => setEmergencyForm(f => ({ ...f, password: e.target.value }))}
                    className="min-h-10"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>緊急パスコード</span>
                    <button
                      type="button"
                      onClick={() => setEmergencyForm(f => ({ ...f, passcodeEnabled: !f.passcodeEnabled }))}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${emergencyForm.passcodeEnabled ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-border text-muted-foreground'}`}
                    >
                      {emergencyForm.passcodeEnabled ? '有効' : '無効'}
                    </button>
                  </Label>
                  <Input
                    type="password"
                    placeholder="新しい緊急パスコード（空白=変更なし）"
                    value={emergencyForm.passcode}
                    onChange={e => setEmergencyForm(f => ({ ...f, passcode: e.target.value }))}
                    className="min-h-10"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 min-h-10"
                    onClick={() => { setEmergencyUserId(null); setEmergencyForm({ password: '', passcode: '', passwordEnabled: false, passcodeEnabled: false }) }}
                  >キャンセル</Button>
                  <Button
                    className="flex-1 min-h-10"
                    disabled={emergencySaving}
                    onClick={async () => {
                      setEmergencySaving(true)
                      try {
                        await api(`/admin/emergency-auth/${emergencyUserId}`, 'PUT', {
                          password: emergencyForm.password || undefined,
                          passcode: emergencyForm.passcode || undefined,
                          passwordEnabled: emergencyForm.passwordEnabled,
                          passcodeEnabled: emergencyForm.passcodeEnabled,
                        })
                        toast.success('緊急認証設定を保存しました')
                        setEmergencyForm(f => ({ ...f, password: '', passcode: '' }))
                        const d = await api('/admin/emergency-auth', 'GET')
                        setEmergencyList(Array.isArray(d) ? d : [])
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'エラーが発生しました')
                      } finally { setEmergencySaving(false) }
                    }}
                  >{emergencySaving ? '保存中…' : '保存'}</Button>
                </div>
              </div>
            )}
          </div>

          {/* 緊急認証有効ユーザー一覧 */}
          {emergencyList.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">緊急認証が設定済みのユーザー</p>
              {emergencyList.map(row => (
                <Card key={row.userId} className="border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{row.displayName}</p>
                    <div className="flex gap-1.5">
                      {row.passwordEnabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">PW有効</span>
                      )}
                      {row.passcodeEnabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">PC有効</span>
                      )}
                      {!row.passwordEnabled && !row.passcodeEnabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">無効</span>
                      )}
                    </div>
                  </div>
                  {row.updatedAt && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      更新: {new Date(row.updatedAt).toLocaleString('ja-JP')}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
          {emergencyList.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              緊急認証が設定されたユーザーはいません
            </p>
          )}
        </TabsContent>

        {/* ── Audit tab ── */}
        <TabsContent value="audit" className="flex flex-col gap-3 mt-3">
          {auditLogs.length === 0 ? (
            <Button onClick={loadAuditLog} variant="outline">監査ログを読み込む</Button>
          ) : (
            <div className="flex flex-col gap-2">
              {auditLogs.map(log => (
                <Card key={log.id} className="border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{log.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  {log.targetUserId && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      対象: {users.find(u => u.userId === log.targetUserId)?.displayName ?? log.targetUserId.slice(0, 12) + '…'}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── 購入申請 tab ── */}
        <TabsContent value="purchase" className="flex flex-col gap-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />購入枚数申請
            </p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadPurchaseRequests} disabled={prLoading}>
              <RefreshCw className={`size-3 mr-1 ${prLoading ? 'animate-spin' : ''}`} />更新
            </Button>
          </div>

          {prLoading ? (
            <p className="text-sm text-center text-muted-foreground py-6">読み込み中…</p>
          ) : purchaseReqs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              申請がありません
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {purchaseReqs.map(pr => {
                const s = PR_STATUS_LABEL[pr.status] ?? { label: pr.status, color: 'text-muted-foreground' }
                const isEditing = prEditId === pr.id
                return (
                  <Card key={pr.id} className="border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm">{Number(pr.amount).toLocaleString()} INMU</span>
                          <span className={`text-[10px] font-medium flex items-center gap-0.5 ${s.color}`}>
                            {pr.status === 'pending'  && <Clock className="size-3" />}
                            {pr.status === 'approved' && <CheckCircle2 className="size-3" />}
                            {pr.status === 'rejected' && <XCircle className="size-3" />}
                            {s.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {pr.displayName ?? pr.userId.slice(0, 12)}
                        </span>
                        {pr.comment && <span className="text-xs text-muted-foreground">"{pr.comment}"</span>}
                        {pr.txHash && (
                          <a href={`https://solscan.io/tx/${pr.txHash}`} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary/70 hover:text-primary font-mono truncate">
                            {pr.txHash.slice(0, 20)}…
                          </a>
                        )}
                        {pr.status === 'approved' && pr.rebateAmount && (
                          <div className="flex flex-col">
                            <span className="text-xs text-green-600 dark:text-green-400">
                              還元: {Number(pr.rebateAmount).toLocaleString()} INMU{pr.rebateRate ? ` (${pr.rebateRate}%)` : ''}
                            </span>
                            {pr.rebateTxSignature && (
                              <a href={`https://solscan.io/tx/${pr.rebateTxSignature}`} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary/70 hover:text-primary font-mono truncate">
                                TxSig: {pr.rebateTxSignature.slice(0, 16)}…
                              </a>
                            )}
                          </div>
                        )}
                        {pr.adminNote && <span className="text-xs text-muted-foreground">管理メモ: {pr.adminNote}</span>}
                        <span className="text-[10px] text-muted-foreground">{new Date(pr.createdAt).toLocaleString('ja-JP')}</span>
                      </div>
                      <Button size="sm" variant={isEditing ? 'secondary' : 'outline'} className="h-7 text-xs shrink-0"
                        onClick={() => {
                          if (isEditing) {
                            setPrEditId(null)
                          } else {
                            setPrEditId(pr.id)
                            setPrStatus(pr.status === 'pending' ? 'approved' : pr.status)
                            setPrRebateAmount(pr.rebateAmount ?? '')
                            setPrRebateRate(pr.rebateRate ?? '')
                            setPrAdminNote(pr.adminNote ?? '')
                          }
                        }}>
                        {isEditing ? 'キャンセル' : '審査'}
                      </Button>
                    </div>

                    {isEditing && (
                      <div className="border-t border-border pt-2 flex flex-col gap-2">
                        {/* Phantom案内バナー */}
                        {prStatus === 'approved' && prRebateAmount && Number(prRebateAmount) > 0 && !getPhantom() && (
                          <div className="flex items-start gap-2 rounded-lg border border-blue-400/30 bg-blue-50/10 px-3 py-2">
                            <span className="text-blue-400 text-base leading-none mt-0.5">⟐</span>
                            <div className="flex-1 min-w-0">
                              {isMobile() ? (
                                <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                                  「保存」を押すとPhantomアプリが起動し、INMUを送金できます。
                                </p>
                              ) : (
                                <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                                  Phantom拡張機能が必要です。
                                  <button
                                    type="button"
                                    className="underline ml-1"
                                    onClick={() => window.open('https://phantom.app/', '_blank')}
                                  >
                                    インストール
                                  </button>
                                  するか、スマホのPhantomブラウザで開いてください。
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <select
                            value={prStatus}
                            onChange={e => setPrStatus(e.target.value)}
                            className="flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="approved">承認</option>
                            <option value="rejected">却下</option>
                            <option value="pending">保留</option>
                          </select>
                        </div>
                        {prStatus === 'approved' && (
                          <div className="flex gap-2">
                            <Input type="number" placeholder="還元INMU枚数" value={prRebateAmount}
                              onChange={e => setPrRebateAmount(e.target.value)} className="min-h-9 flex-1" />
                            <Input type="number" placeholder="還元率%" value={prRebateRate}
                              onChange={e => {
                                setPrRebateRate(e.target.value)
                                if (e.target.value && pr.amount) {
                                  setPrRebateAmount(String(Math.round(Number(pr.amount) * Number(e.target.value) / 100)))
                                }
                              }} className="min-h-9 w-24" />
                          </div>
                        )}
                        <Input placeholder="管理メモ（任意）" value={prAdminNote}
                          onChange={e => setPrAdminNote(e.target.value)} className="min-h-9" />
                        <Button className="min-h-9" disabled={prSaving} onClick={() => savePurchaseReview(pr.id)}>
                          {prSaving ? '保存中…' : (
                            prStatus === 'approved' && prRebateAmount && Number(prRebateAmount) > 0 && !getPhantom() && isMobile()
                              ? '保存 → Phantomで署名'
                              : '保存'
                          )}
                        </Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── システム設定 tab ── */}
        <TabsContent value="settings" className="flex flex-col gap-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Settings className="size-4 text-primary" />システム設定
            </p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadSystemSettings} disabled={settingsLoading}>
              <RefreshCw className={`size-3 mr-1 ${settingsLoading ? 'animate-spin' : ''}`} />更新
            </Button>
          </div>

          <div className="rounded-lg border border-border/50 bg-secondary/10 p-3">
            <p className="text-[11px] text-muted-foreground">
              ここで変更した値はコード修正なしで即時反映されます。
            </p>
          </div>

          {settingsLoading ? (
            <p className="text-sm text-center text-muted-foreground py-6">読み込み中…</p>
          ) : systemSettings.length === 0 ? (
            <Button onClick={loadSystemSettings} variant="outline">設定を読み込む</Button>
          ) : (
            <div className="flex flex-col gap-2">
              {systemSettings.map(s => {
                const isEditing = editingSettingKey === s.key
                const presets = SYSTEM_SETTING_PRESETS[s.key]
                return (
                  <Card key={s.key} className="border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <p className="text-sm font-medium">{s.description ?? s.key}</p>
                        <p className="font-mono text-sm font-bold text-primary">
                          {Number(s.value).toLocaleString()}
                          {s.key.includes('limit') ? ' INMU' : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          更新: {new Date(s.updatedAt).toLocaleString('ja-JP')}
                        </p>
                      </div>
                      <Button size="sm" variant={isEditing ? 'secondary' : 'outline'} className="h-7 text-xs shrink-0"
                        onClick={() => {
                          if (isEditing) { setEditingSettingKey(null); setSettingEditValue('') }
                          else { setEditingSettingKey(s.key); setSettingEditValue(s.value) }
                        }}>
                        {isEditing ? 'キャンセル' : '変更'}
                      </Button>
                    </div>

                    {isEditing && (
                      <div className="border-t border-border pt-2 flex flex-col gap-2">
                        <Input type="number" value={settingEditValue}
                          onChange={e => setSettingEditValue(e.target.value)}
                          placeholder="新しい値" className="min-h-9" />
                        {presets && (
                          <div className="flex flex-wrap gap-1.5">
                            {presets.map(p => (
                              <button key={p} type="button" onClick={() => setSettingEditValue(p)}
                                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${settingEditValue === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                                {Number(p).toLocaleString()}
                              </button>
                            ))}
                          </div>
                        )}
                        <Button className="min-h-9" disabled={settingSaving || !settingEditValue}
                          onClick={() => saveSystemSetting(s.key)}>
                          {settingSaving ? '保存中…' : '保存'}
                        </Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── 売買履歴 tab ── */}
        <TabsContent value="trade" className="flex flex-col gap-3 mt-3">
          {/* ユーザー検索フィルタ + スキャンボタン */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="ユーザー名で絞り込み"
                value={tradeUserFilter}
                onChange={e => setTradeUserFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 pl-8 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* ウォレット登録ユーザーのスキャンボタン一覧 */}
          {users.filter(u => u.solWallet && (!tradeUserFilter || u.displayName.toLowerCase().includes(tradeUserFilter.toLowerCase()))).length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <RefreshCw className="size-3" /> ウォレット登録ユーザーのスキャン
              </p>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                {users
                  .filter(u => u.solWallet && (!tradeUserFilter || u.displayName.toLowerCase().includes(tradeUserFilter.toLowerCase())))
                  .map(u => (
                    <div key={u.userId} className="flex items-center justify-between rounded-md bg-secondary/30 px-2.5 py-1.5">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{u.displayName}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{maskWallet(u.solWallet!)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={tradeScanning === u.userId}
                        onClick={() => handleAdminScan(u.userId)}
                      >
                        <RefreshCw className={`size-3 ${tradeScanning === u.userId ? 'animate-spin' : ''}`} />
                        スキャン
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 取引一覧 */}
          {tradeLoading ? (
            <p className="text-xs text-center text-muted-foreground py-4">読み込み中…</p>
          ) : tradeRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              売買履歴がありません。ウォレット登録ユーザーをスキャンしてください。
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {tradeRows
                .filter(r => !tradeUserFilter || (users.find(u => u.userId === r.userId)?.displayName ?? '').toLowerCase().includes(tradeUserFilter.toLowerCase()))
                .map(row => {
                  const isBuy = row.type === 'buy'
                  const userName = users.find(u => u.userId === row.userId)?.displayName ?? row.userId.slice(0, 10)
                  return (
                    <Card key={row.id} className="border-border bg-card p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            {isBuy
                              ? <TrendingUp className="size-3.5 text-green-500" />
                              : <TrendingDown className="size-3.5 text-red-500" />}
                            <span className={`text-xs font-semibold ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                              {isBuy ? '購入' : '売却'}
                            </span>
                            {row.dex && <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-muted-foreground">{row.dex}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground">{userName}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(row.tradedAt).toLocaleString('ja-JP')}</span>
                          <a
                            href={`https://solscan.io/tx/${row.txSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary/70 hover:text-primary font-mono"
                          >
                            {row.txSignature.slice(0, 12)}…
                          </a>
                        </div>
                        <span className={`font-mono font-bold text-sm shrink-0 ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {isBuy ? '+' : '-'}{formatInmu(row.tokenAmount)}
                        </span>
                      </div>
                    </Card>
                  )
                })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── ユーザー詳細ダイアログ ── */}
      <Dialog open={!!detailUser} onOpenChange={open => { if (!open) setDetailUser(null) }}>
        {detailUser && (
          <UserDetailDialog
            user={detailUser}
            onClose={() => setDetailUser(null)}
            onDelete={deleteUser}
          />
        )}
      </Dialog>

      {/* ── パスコード確認ダイアログ ── */}
      <Dialog open={!!confirmOp} onOpenChange={open => { if (!open) { setConfirmOp(null); setPasscodeInput('') } }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4 text-primary" />
              操作の確認
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{confirmOp?.label}</span> を実行するには管理コードを入力してください。
            </p>
            <Input
              type="password"
              placeholder="管理コードを入力"
              value={passcodeInput}
              onChange={e => setPasscodeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmPasscode() }}
              className="min-h-11 text-base"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 min-h-10"
                onClick={() => { setConfirmOp(null); setPasscodeInput('') }}
              >
                キャンセル
              </Button>
              <Button
                className="flex-1 min-h-10"
                disabled={!passcodeInput || passcodeLoading}
                onClick={handleConfirmPasscode}
              >
                {passcodeLoading ? '確認中…' : '実行'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
