import { AdminMissionManager } from '@/components/admin-mission-manager'
import { AdminPetRewardRequests } from '@/components/admin-pet-reward-requests'
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
  const deepLink = `phantom://browse/${url}?ref=${ref}`
  const universalLink = `https://phantom.app/ul/browse/${url}?ref=${ref}`
  if (isIOS()) {
    window.location.href = deepLink
  } else {
    window.location.href = `intent://browse/${url}#Intent;scheme=phantom;package=app.phantom;S.browser_fallback_url=${encodeURIComponent(universalLink)};end`
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
  details: Record<string, unknown> | null
  createdAt: string
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  deleteUser:                '👤 ユーザー削除',
  adminSolTransfer:          '💸 INMU送金',
  adminAirdropBatch:         '🪂 エアドロップ（バッチ）',
  adminSetBalance:           '⚖️  残高設定',
  adminRegisterTx:           '📝 取引登録',
  adminDistributeReward:     '🎁 報酬配布',
  adminDistributeAirdrop:    '🪂 エアドロップ配布',
  adminDistributeAirdropAll: '🪂 全員エアドロップ',
  adminGrantPoints:          '⭐ ポイント付与',
  adminGrantPointsAll:       '⭐ 全員ポイント付与',
  adminDeductBalance:        '➖ 残高減算',
  adminDeductPoints:         '➖ ポイント減算',
  adminSendNotification:     '📣 通知送信',
  adminSetRole:              '🔑 ロール変更',
  adminBackupCsv:            '📥 CSVバックアップ',
  emergency_auth_updated:    '🔒 緊急認証設定',
  purchase_request_approved: '✅ 購入申請承認',
  purchase_request_rejected: '❌ 購入申請却下',
  change_admin_code_owner:   '🔑 Ownerコード変更',
  change_admin_code_operator:'🔑 Operatorコード変更',
}

function getAdminLabel(adminId: string) {
  if (adminId === 'admin_owner' || adminId === 'admin') return 'Owner'
  if (adminId === 'admin_operator') return 'Operator'
  return adminId.slice(0, 12)
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
  source?: 'tx' | 'trade'
  type: string
  amount: string
  memo: string | null
  counterparty: string | null
  txHash: string | null
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
  petRebateBonusRate: number
  petRebateBonuses: Array<{ source: 'level_reward' | 'skill'; label: string; rate: number; eventOnly: boolean }>
  isEventPurchase: boolean
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
  normal_daily_purchase_limit: ['100000', '200000', '300000', '500000'],
  event_daily_purchase_limit:  ['200000', '300000', '500000', '1000000'],
}

const SYSTEM_SETTING_TYPE: Record<string, 'number' | 'boolean' | 'date'> = {
  event_mode_enabled: 'boolean',
  event_start_date:   'date',
  event_end_date:     'date',
}

type GachaResultRow = {
  id: number              // gachaInmuWins.id（当選個別ID）
  spinId: number          // gachaResults.id（スピンID）
  userId: string
  displayName: string | null
  profileSolWallet: string | null   // profile テーブルの最新ウォレット
  solWallet: string | null          // 送金時に使ったウォレット（送金済時のみ）
  pullType: string
  isFree: boolean
  inmuAmount: number      // 常に 10000
  inmuSentStatus: 'pending' | 'sending' | 'sent' | 'failed'
  inmuSentAt: string | null
  inmuSentByAdminId: string | null
  wasGuaranteed: boolean
  txHash: string | null
  failureReason: string | null
  createdAt: string
}

type SpinRow = {
  id: number
  userId: string
  displayName: string | null
  pullType: string
  isFree: boolean
  results: Array<{ prizeId: string; label: string; type: 'points'|'inmu'; amount: number }>
  totalPoints: number
  hasInmu: boolean
  inmuCount: number
  inmuSentStatus: string
  wasGuaranteed: boolean
  costPoints: number
  createdAt: string
}

function formatSettingDisplay(key: string, value: string): string {
  if (SYSTEM_SETTING_TYPE[key] === 'boolean') return value === 'true' ? '✅ 有効' : '❌ 無効'
  if (SYSTEM_SETTING_TYPE[key] === 'date') return value || '未設定'
  const n = Number(value)
  if (!isNaN(n)) return `${n.toLocaleString()}${key.includes('limit') ? ' INMU' : ''}`
  return value || '—'
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
  receive: 'INMU受取',
  reward: '管理者配布（報酬）',
  airdrop: 'エアドロ受取',
  inmu_send: 'INMU配布',
  points_send: 'ポイント受取',
  points_deduct: 'ポイント減算',
  mission_reward: 'ミッション報酬',
  dex_buy: 'DEX購入（INMU）',
  dex_sell: 'DEX売却（INMU）',
  gacha_reward: 'ガチャ報酬',
}

const TX_INCOME_TYPES = ['deposit', 'receive', 'reward', 'airdrop', 'inmu_send', 'points_send', 'mission_reward', 'dex_buy', 'gacha_reward']

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

  const [gachaResults, setGachaResults] = useState<GachaResultRow[]>([])
  const [gachaLoading, setGachaLoading] = useState(false)
  const [gachaFetched, setGachaFetched] = useState(false)
  const [gachaFilter, setGachaFilter] = useState<'inmu_pending'|'inmu_sent'|'inmu_failed'|'all'>('inmu_pending')
  const [gachaSelectedIds, setGachaSelectedIds] = useState<Set<number>>(new Set())
  const [bulkSending, setBulkSending] = useState(false)
  const [gachaSpins, setGachaSpins] = useState<SpinRow[]>([])
  const [gachaSpinsLoading, setGachaSpinsLoading] = useState(false)
  const [gachaSpinsFetched, setGachaSpinsFetched] = useState(false)

  const loadGachaResults = useCallback(async () => {
    if (gachaFetched) return
    setGachaLoading(true)
    try {
      const data = await api('/admin/gacha/results', 'GET') as GachaResultRow[]
      setGachaResults(Array.isArray(data) ? data : [])
      setGachaFetched(true)
    } catch { toast.error('ガチャデータの取得に失敗しました') }
    finally { setGachaLoading(false) }
  }, [api, gachaFetched])

  const loadGachaSpins = useCallback(async () => {
    if (gachaSpinsFetched) return
    setGachaSpinsLoading(true)
    try {
      const data = await api('/admin/gacha/spins', 'GET') as SpinRow[]
      setGachaSpins(Array.isArray(data) ? data : [])
      setGachaSpinsFetched(true)
    } catch { toast.error('スピン履歴の取得に失敗しました') }
    finally { setGachaSpinsLoading(false) }
  }, [api, gachaSpinsFetched])

  async function reloadGachaResults() {
    setGachaFetched(false)
    setGachaSpinsFetched(false)
    setGachaLoading(true)
    try {
      const [data, spins] = await Promise.all([
        api('/admin/gacha/results', 'GET') as Promise<GachaResultRow[]>,
        api('/admin/gacha/spins', 'GET') as Promise<SpinRow[]>,
      ])
      setGachaResults(Array.isArray(data) ? data : [])
      setGachaSpins(Array.isArray(spins) ? spins : [])
      setGachaFetched(true)
      setGachaSpinsFetched(true)
    } catch { toast.error('ガチャデータの取得に失敗しました') }
    finally { setGachaLoading(false) }
  }

  // ── 個別 Phantom 送金（1当選 = 1 TX）──
  async function markGachaSent(row: GachaResultRow) {
    const wallet = row.profileSolWallet ?? row.solWallet
    if (!wallet) {
      toast.error('この当選者はSOLウォレットが未設定です。ユーザーにウォレット登録を依頼してください。')
      return
    }

    const phantom = getPhantom()
    if (!phantom) {
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

    const inmuAmount = row.inmuAmount ?? 10000
    const rawAmount  = Math.floor(inmuAmount * Math.pow(10, INMU_DECIMALS))
    const toastId    = `gacha-send-${row.id}`

    setGachaResults(p => p.map(r => r.id === row.id ? { ...r, inmuSentStatus: 'sending' } : r))

    try {
      const connection = new Connection(getAdminRpcUrl(), 'confirmed')

      toast.loading('Phantom に接続中…', { id: toastId })
      const resp = await phantom.connect()
      const adminPubkey = new PublicKey(resp.publicKey.toString())
      toast.dismiss(toastId)

      const toPubkey = new PublicKey(wallet)
      const fromATA  = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, adminPubkey, false, TOKEN_2022_PROGRAM_ID)
      const toATA    = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, toPubkey,   false, TOKEN_2022_PROGRAM_ID)

      const tx = new Transaction()
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(adminPubkey, toATA, toPubkey, INMU_MINT_PUBKEY, TOKEN_2022_PROGRAM_ID),
        createTransferInstruction(fromATA, toATA, adminPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID),
      )
      tx.feePayer = adminPubkey
      const { blockhash } = await connection.getLatestBlockhash('processed')
      tx.recentBlockhash = blockhash

      toast.loading('Phantom で署名してください…', { id: toastId })
      const signedTx = await phantom.signTransaction(tx)
      toast.dismiss(toastId)

      toast.loading('Solana へ送信中…', { id: toastId })
      const signature = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true, maxRetries: 5 })
      toast.dismiss(toastId)


      await api(`/admin/gacha/results/${row.id}/mark-sent`, 'PUT', { txHash: signature, solWallet: wallet })

      setGachaResults(p => p.map(r => r.id === row.id
        ? { ...r, inmuSentStatus: 'sent', txHash: signature, solWallet: wallet, inmuSentAt: new Date().toISOString() }
        : r
      ))
      toast.success(`✅ ${inmuAmount.toLocaleString()} INMU 送金完了！`)

    } catch (e: unknown) {
      toast.dismiss(toastId)
      const msg = e instanceof Error ? e.message : '不明なエラー'

      if (msg === 'User rejected the request.') {
        setGachaResults(p => p.map(r => r.id === row.id ? { ...r, inmuSentStatus: 'pending' } : r))
        toast.info('送金をキャンセルしました')
      } else {
        await api(`/admin/gacha/results/${row.id}/mark-failed`, 'PUT', { failureReason: msg }).catch(() => {})
        setGachaResults(p => p.map(r => r.id === row.id ? { ...r, inmuSentStatus: 'failed', failureReason: msg } : r))
        toast.error(`送金失敗: ${msg}`)
      }
    }
  }

  // ── 一括 Phantom 送金（選択した全当選を1つの TX にまとめる）──
  async function markGachaBulkSent(selectedRows: GachaResultRow[]) {
    const sendable = selectedRows.filter(r =>
      (r.inmuSentStatus === 'pending' || r.inmuSentStatus === 'failed') &&
      (r.profileSolWallet ?? r.solWallet)
    )
    const noWallet = selectedRows.filter(r => !(r.profileSolWallet ?? r.solWallet))

    if (noWallet.length > 0) {
      toast.warning(`${noWallet.length}件はウォレット未設定のためスキップします`)
    }
    if (sendable.length === 0) {
      toast.error('送金可能な当選がありません（ウォレット未設定または送金済）')
      return
    }

    const phantom = getPhantom()
    if (!phantom) {
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

    setBulkSending(true)
    const toastId = 'gacha-bulk-send'
    // 対象を全て「sending」表示に
    setGachaResults(p => p.map(r =>
      sendable.some(s => s.id === r.id) ? { ...r, inmuSentStatus: 'sending' } : r
    ))

    try {
      const connection = new Connection(getAdminRpcUrl(), 'confirmed')

      toast.loading('Phantom に接続中…', { id: toastId })
      const resp = await phantom.connect()
      const adminPubkey = new PublicKey(resp.publicKey.toString())
      const fromATA = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, adminPubkey, false, TOKEN_2022_PROGRAM_ID)
      toast.dismiss(toastId)

      // 1つの TX に全 transfer 命令をまとめる
      const tx = new Transaction()
      for (const row of sendable) {
        const wallet = row.profileSolWallet ?? row.solWallet!
        const toPubkey = new PublicKey(wallet)
        const toATA = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, toPubkey, false, TOKEN_2022_PROGRAM_ID)
        const rawAmount = Math.floor((row.inmuAmount ?? 10000) * Math.pow(10, INMU_DECIMALS))
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(adminPubkey, toATA, toPubkey, INMU_MINT_PUBKEY, TOKEN_2022_PROGRAM_ID),
          createTransferInstruction(fromATA, toATA, adminPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID),
        )
      }
      tx.feePayer = adminPubkey
      const { blockhash } = await connection.getLatestBlockhash('processed')
      tx.recentBlockhash = blockhash

      toast.loading(`Phantom で署名してください（${sendable.length}件 まとめて送金）…`, { id: toastId })
      const signedTx = await phantom.signTransaction(tx)
      toast.dismiss(toastId)

      toast.loading('Solana へ送信中…', { id: toastId })
      const signature = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true, maxRetries: 5 })
      toast.dismiss(toastId)


      // 全件を mark-sent（同一 txHash で各 ID を個別に記録）
      const sentAt = new Date().toISOString()
      let successCount = 0
      for (const row of sendable) {
        const wallet = row.profileSolWallet ?? row.solWallet!
        try {
          await api(`/admin/gacha/results/${row.id}/mark-sent`, 'PUT', { txHash: signature, solWallet: wallet })
          setGachaResults(p => p.map(r => r.id === row.id
            ? { ...r, inmuSentStatus: 'sent', txHash: signature, solWallet: wallet, inmuSentAt: sentAt }
            : r
          ))
          successCount++
        } catch {
          // API 失敗は個別に failed 扱い（TX は成功しているので DB だけ再試行可能）
          setGachaResults(p => p.map(r => r.id === row.id
            ? { ...r, inmuSentStatus: 'failed', failureReason: 'DB記録失敗（TX成功）' }
            : r
          ))
        }
      }
      setGachaSelectedIds(new Set())
      toast.success(`✅ 一括送金完了！ ${successCount}/${sendable.length}件 成功（txHash: ${signature.slice(0, 16)}…）`)

    } catch (e: unknown) {
      toast.dismiss(toastId)
      const msg = e instanceof Error ? e.message : '不明なエラー'

      if (msg === 'User rejected the request.') {
        // キャンセル → pending に戻す
        setGachaResults(p => p.map(r =>
          sendable.some(s => s.id === r.id) ? { ...r, inmuSentStatus: 'pending' } : r
        ))
        toast.info('一括送金をキャンセルしました')
      } else {
        // 全件 failed
        for (const row of sendable) {
          await api(`/admin/gacha/results/${row.id}/mark-failed`, 'PUT', { failureReason: msg }).catch(() => {})
        }
        setGachaResults(p => p.map(r =>
          sendable.some(s => s.id === r.id) ? { ...r, inmuSentStatus: 'failed', failureReason: msg } : r
        ))
        toast.error(`一括送金失敗: ${msg}`)
      }
    } finally {
      setBulkSending(false)
    }
  }

  async function markGachaRetry(id: number) {
    try {
      await api(`/admin/gacha/results/${id}/reset-pending`, 'PUT')
      setGachaResults(p => p.map(r => r.id === id ? { ...r, inmuSentStatus: 'pending', failureReason: null } : r))
      toast.success('再送金待ち状態に戻しました')
    } catch { toast.error('リセットに失敗しました') }
  }

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
        const { blockhash } = await connection.getLatestBlockhash('processed')
        tx.recentBlockhash = blockhash

        toast.loading(`Phantom で署名してください${chunkLabel}…`, { id: 'ph-airdrop-sign' })
        const signedTx = await phantom.signTransaction(tx)
        toast.dismiss('ph-airdrop-sign')

        toast.loading(`Solana へ送信中${chunkLabel}…`, { id: 'ph-airdrop-send' })
        const signature = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true, maxRetries: 5 })
        toast.dismiss('ph-airdrop-send')


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
      const result = await api('/admin/solana/scan-trades', 'POST', { targetUserId: userId }) as { added: number; total: number; skipped: number }
      toast.success(`${result.added}件追加（スキップ:${result.skipped ?? 0}件 / 合計${result.total}件）`)
      await loadTradeHistory(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setTradeScanning(null)
    }
  }

  const [tradeReclassifying, setTradeReclassifying] = useState<string | null>(null)

  async function handleAdminReclassify(userId: string) {
    if (!window.confirm('既存の取引履歴を再分類します。通常送金と判定されたレコードは「transfer」タイプに変更されます（削除はしません）。続行しますか？')) return
    setTradeReclassifying(userId)
    try {
      const result = await api('/admin/solana/reclassify-trades', 'POST', { targetUserId: userId }) as { reclassified: number; unchanged: number; failed: number }
      toast.success(`再分類完了: ${result.reclassified}件変更・${result.unchanged}件変更なし・${result.failed}件RPC取得失敗`)
      await loadTradeHistory(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setTradeReclassifying(null)
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
          instrs.push(createAssociatedTokenAccountIdempotentInstruction(
            fromPubkey, toATA, toPubkey, INMU_MINT_KEY, TOKEN_2022_PROGRAM_ID,
          ))

          const rawAmount = Math.floor(numRebate * Math.pow(10, INMU_DEC))
          instrs.push(createTransferInstruction(fromATA, toATA, fromPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID))

          const tx = new Transaction()
          tx.add(...instrs)
          tx.feePayer = fromPubkey
          const { blockhash } = await connection.getLatestBlockhash('processed')
          tx.recentBlockhash = blockhash

          toast.loading('Phantom で署名してください…', { id: 'ph-sign' })
          const signedTx = await phantom.signTransaction(tx)
          toast.dismiss('ph-sign')

          toast.loading('Solana へ送信中…', { id: 'ph-send' })
          const signature = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true, maxRetries: 5 })
          toast.dismiss('ph-send')
          rebateTxSignature = signature

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
        <TabsList className="grid w-full grid-cols-5 h-auto gap-0.5">
          <TabsTrigger value="users" className="text-xs py-1.5">Users</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs py-1.5">Actions</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs py-1.5">Audit</TabsTrigger>
          <TabsTrigger value="missions" className="text-xs py-1.5">Mission</TabsTrigger>
          <TabsTrigger value="gacha" className="text-xs py-1.5" onClick={loadGachaResults}>🎰 ガチャ</TabsTrigger>
          <TabsTrigger value="emergency" className="text-xs py-1.5" onClick={async () => {
            try { const d = await api('/admin/emergency-auth', 'GET'); setEmergencyList(Array.isArray(d) ? d : []) } catch { setEmergencyList([]) }
          }}>緊急</TabsTrigger>
          <TabsTrigger value="trade" className="text-xs py-1.5" onClick={() => loadTradeHistory()}>売買</TabsTrigger>
          <TabsTrigger value="purchase" className="text-xs py-1.5" onClick={loadPurchaseRequests}>
            <ShoppingCart className="size-3 mr-1" />申請
          </TabsTrigger>
          <TabsTrigger value="pet-rewards" className="text-xs py-1.5">
            <Coins className="size-3 mr-1" />PET報酬
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
          <AdminMissionManager api={api} />
        </TabsContent>

        <TabsContent value="pet-rewards" className="flex flex-col gap-4 mt-3">
          <AdminPetRewardRequests />
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
              <Button size="sm" variant="outline" className="h-8 text-xs self-end" onClick={loadAuditLog}>
                <RefreshCw className="size-3 mr-1" />更新
              </Button>
              {auditLogs.map(log => {
                const label = AUDIT_ACTION_LABEL[log.action] ?? log.action
                const adminLabel = getAdminLabel(log.adminId)
                const targetName = log.targetUserId
                  ? users.find(u => u.userId === log.targetUserId)?.displayName ?? log.targetUserId.slice(0, 12) + '…'
                  : null
                const detailEntries = log.details
                  ? Object.entries(log.details).filter(([, v]) => v != null && v !== '').slice(0, 4)
                  : []
                return (
                  <Card key={log.id} className="border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-[10px] text-primary font-semibold">{adminLabel}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(log.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    {targetName && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        対象: <span className="font-medium text-foreground">{targetName}</span>
                      </p>
                    )}
                    {detailEntries.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {detailEntries.map(([k, v]) => (
                          <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                )
              })}
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
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{pr.displayName ?? pr.userId.slice(0, 12)}</span>
                          {pr.petRebateBonusRate > 0 && (
                            <span className="rounded border border-fuchsia-300/30 bg-fuchsia-300/10 px-1.5 py-0.5 font-black text-fuchsia-200">
                              +{pr.petRebateBonusRate}%
                            </span>
                          )}
                        </div>
                        {pr.petRebateBonuses?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {pr.petRebateBonuses.map(bonus => (
                              <span key={`${bonus.source}-${bonus.label}`} className="rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                                {bonus.label} +{bonus.rate}%{bonus.eventOnly ? '（イベント）' : ''}
                              </span>
                            ))}
                          </div>
                        )}
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
                        <p className={`font-mono text-sm font-bold ${s.key === 'event_mode_enabled' && s.value === 'true' ? 'text-green-500' : 'text-primary'}`}>
                          {formatSettingDisplay(s.key, s.value)}
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
                        {SYSTEM_SETTING_TYPE[s.key] === 'boolean' ? (
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant={settingEditValue === 'true' ? 'default' : 'outline'}
                              className="flex-1 min-h-9 gap-1" onClick={() => setSettingEditValue('true')}>
                              ✅ 有効
                            </Button>
                            <Button type="button" size="sm" variant={settingEditValue === 'false' ? 'default' : 'outline'}
                              className="flex-1 min-h-9 gap-1" onClick={() => setSettingEditValue('false')}>
                              ❌ 無効
                            </Button>
                          </div>
                        ) : SYSTEM_SETTING_TYPE[s.key] === 'date' ? (
                          <Input type="date" value={settingEditValue}
                            onChange={e => setSettingEditValue(e.target.value)}
                            className="min-h-9" />
                        ) : (
                          <Input type="number" value={settingEditValue}
                            onChange={e => setSettingEditValue(e.target.value)}
                            placeholder="新しい値" className="min-h-9" />
                        )}
                        {presets && SYSTEM_SETTING_TYPE[s.key] !== 'boolean' && SYSTEM_SETTING_TYPE[s.key] !== 'date' && (
                          <div className="flex flex-wrap gap-1.5">
                            {presets.map(p => (
                              <button key={p} type="button" onClick={() => setSettingEditValue(p)}
                                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${settingEditValue === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                                {Number(p).toLocaleString()}
                              </button>
                            ))}
                          </div>
                        )}
                        <Button className="min-h-9"
                          disabled={settingSaving || (SYSTEM_SETTING_TYPE[s.key] == null && !settingEditValue)}
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
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={tradeScanning === u.userId || tradeReclassifying === u.userId}
                          onClick={() => handleAdminScan(u.userId)}
                        >
                          <RefreshCw className={`size-3 ${tradeScanning === u.userId ? 'animate-spin' : ''}`} />
                          スキャン
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-yellow-500/50 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10"
                          disabled={tradeScanning === u.userId || tradeReclassifying === u.userId}
                          onClick={() => handleAdminReclassify(u.userId)}
                          title="既存の取引履歴を再分類（通常送金を除外）"
                        >
                          <RefreshCw className={`size-3 ${tradeReclassifying === u.userId ? 'animate-spin' : ''}`} />
                          再分類
                        </Button>
                      </div>
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

        {/* ── ガチャ管理 ── */}
        <TabsContent value="gacha" className="flex flex-col gap-4 mt-3">
          {(gachaLoading || (gachaFilter === 'all' && gachaSpinsLoading)) && (
            <p className="text-sm text-muted-foreground text-center py-6">読み込み中…</p>
          )}

          {!(gachaLoading || (gachaFilter === 'all' && gachaSpinsLoading)) && (() => {
            const inmuPending = gachaResults.filter(r => r.inmuSentStatus === 'pending')
            const inmuSending = gachaResults.filter(r => r.inmuSentStatus === 'sending')
            const inmuSent    = gachaResults.filter(r => r.inmuSentStatus === 'sent')
            const inmuFailed  = gachaResults.filter(r => r.inmuSentStatus === 'failed')

            const totalPtsGiven = gachaSpins.reduce((s, r) => s + (r.totalPoints ?? 0), 0)

            const filtered = gachaFilter === 'inmu_pending'
              ? [...inmuSending, ...inmuPending]
              : gachaFilter === 'inmu_failed'
                ? inmuFailed
                : gachaFilter === 'inmu_sent'
                  ? inmuSent
                  : [] // 'all' はbelow で gachaSpins を使う

            // 選択中の pending/failed 行（送金可能なもの）
            const selectedSendable = filtered.filter(r =>
              gachaSelectedIds.has(r.id) &&
              (r.inmuSentStatus === 'pending' || r.inmuSentStatus === 'failed')
            )
            // フィルタ中の送金可能行
            const sendableInFiltered = filtered.filter(r =>
              r.inmuSentStatus === 'pending' || r.inmuSentStatus === 'failed'
            )

            return (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '総スピン数',    value: gachaSpinsFetched ? gachaSpins.length : '—' },
                    { label: 'ポイント付与',  value: gachaSpinsFetched ? `${totalPtsGiven.toLocaleString()}pt` : '—' },
                    { label: '未送金INMU',    value: inmuPending.length + inmuSending.length, cls: (inmuPending.length + inmuSending.length) > 0 ? 'text-yellow-400' : undefined },
                    { label: '送金済みINMU',  value: inmuSent.length,   cls: 'text-green-400' },
                    { label: 'INMU当選総数',  value: gachaResults.length },
                    { label: '送金失敗',      value: inmuFailed.length, cls: inmuFailed.length > 0 ? 'text-red-400' : undefined },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-3 text-center">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${cls ?? ''}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Filter + Refresh */}
                <div className="flex gap-1.5 items-center flex-wrap">
                  {([
                    { f: 'inmu_pending', label: `🏆 未送金 (${inmuPending.length + inmuSending.length})` },
                    { f: 'inmu_sent',    label: `✅ 送金済 (${inmuSent.length})` },
                    { f: 'inmu_failed',  label: `❌ 送金失敗 (${inmuFailed.length})` },
                    { f: 'all',          label: `📋 全スピン履歴 (${gachaSpinsFetched ? gachaSpins.length : '…'})` },
                  ] as const).map(({ f, label }) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setGachaFilter(f)
                        setGachaSelectedIds(new Set())
                        if (f === 'all') loadGachaSpins()
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${gachaFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    >
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={reloadGachaResults} className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors ml-auto">
                    ↻ 更新
                  </button>
                </div>

                {/* 一括操作バー（未送金・失敗フィルタ時のみ表示）*/}
                {(gachaFilter === 'inmu_pending' || gachaFilter === 'inmu_failed') && sendableInFiltered.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-lg border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = new Set(sendableInFiltered.map(r => r.id))
                        const allSelected = sendableInFiltered.every(r => gachaSelectedIds.has(r.id))
                        setGachaSelectedIds(allSelected ? new Set() : allIds)
                      }}
                      className="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {sendableInFiltered.every(r => gachaSelectedIds.has(r.id)) ? '☑ 全解除' : '☐ 全選択'}
                    </button>
                    {gachaSelectedIds.size > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground">{gachaSelectedIds.size}件選択中</span>
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs bg-green-800 hover:bg-green-700 text-white ml-auto"
                          disabled={bulkSending || selectedSendable.length === 0}
                          onClick={() => markGachaBulkSent(selectedSendable)}
                        >
                          {bulkSending ? '送金中…' : `💸 選択した ${selectedSendable.length}件 をまとめて送金`}
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* ── INMU 管理リスト（未送金/送金済/失敗）── */}
                {gachaFilter !== 'all' && (
                  <>
                    {filtered.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
                        {gachaFilter === 'inmu_pending' ? '未送金のINMU当選はありません 🎉' : gachaFilter === 'inmu_sent' ? '送金済みのINMUはまだありません' : '送金失敗はありません'}
                      </p>
                    )}
                    <div className="flex flex-col gap-2">
                      {filtered.map(row => {
                        const isPending  = row.inmuSentStatus === 'pending'
                        const isSending  = row.inmuSentStatus === 'sending'
                        const isSent     = row.inmuSentStatus === 'sent'
                        const isFailed   = row.inmuSentStatus === 'failed'
                        const inmuAmount = row.inmuAmount ?? 10000
                        const wallet     = row.profileSolWallet ?? row.solWallet
                        const canSelect  = isPending || isFailed
                        const isSelected = gachaSelectedIds.has(row.id)
                        const cardBorder = isSent ? 'border-green-500/30 bg-green-950/5'
                          : isFailed  ? 'border-red-500/30 bg-red-950/10'
                          : isSending ? 'border-blue-500/30 bg-blue-950/10'
                          : isPending ? 'border-yellow-500/40 bg-yellow-950/10' : ''

                        return (
                          <Card key={row.id} className={`p-3 border-border ${cardBorder} ${isSelected ? 'ring-1 ring-primary' : ''}`}>
                            <div className="flex items-start gap-2">
                              {canSelect ? (
                                <button type="button" className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                  onClick={() => setGachaSelectedIds(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n })}>
                                  {isSelected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                                </button>
                              ) : <div className="w-4 shrink-0" />}

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold">{row.displayName || row.userId.slice(0, 12)}</span>
                                  <span className="text-[10px] text-muted-foreground">{row.pullType === 'multi' ? '10連' : row.pullType === 'free' ? '無料' : '1連'}</span>
                                  {row.isFree && <span className="text-[10px] text-emerald-400 px-1 py-0.5 rounded bg-emerald-950/40 border border-emerald-700">🎁 無料</span>}
                                  {row.wasGuaranteed && <span className="text-[10px] text-yellow-400 px-1 py-0.5 rounded bg-yellow-950/40 border border-yellow-700">✨確定</span>}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${isSent ? 'text-green-400 border-green-700 bg-green-950/30' : isFailed ? 'text-red-400 border-red-700 bg-red-950/30' : isSending ? 'text-blue-400 border-blue-700 bg-blue-950/30' : 'text-yellow-300 border-yellow-600 bg-yellow-950/40'}`}>
                                    🏆 {inmuAmount.toLocaleString()} INMU {isSent ? '送金済' : isFailed ? '送金失敗' : isSending ? '送金中…' : '未送金'}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground ml-auto">Win#{row.id}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(row.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  {' — '}スピンID: {row.spinId}
                                </p>
                                <p className="text-[10px] mt-0.5">
                                  <span className="text-muted-foreground">送金先: </span>
                                  {wallet ? <span className="font-mono text-foreground">{wallet.slice(0, 8)}…{wallet.slice(-8)}</span> : <span className="text-red-400">⚠️ ウォレット未設定</span>}
                                </p>
                                {isSent && row.inmuSentAt && (
                                  <p className="text-[10px] text-green-400 mt-0.5">送金済: {new Date(row.inmuSentAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                                )}
                                {row.txHash && (
                                  <p className="text-[10px] mt-0.5">
                                    <span className="text-muted-foreground">txHash: </span>
                                    <a href={`https://solscan.io/tx/${row.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-400 hover:underline">{row.txHash.slice(0, 16)}…</a>
                                  </p>
                                )}
                                {isFailed && row.failureReason && <p className="text-[10px] text-red-400 mt-0.5">失敗: {row.failureReason.slice(0, 80)}</p>}
                              </div>

                              <div className="flex flex-col gap-1.5 shrink-0">
                                {(isPending || isFailed) && !isSending && (
                                  <Button size="sm"
                                    className={`h-8 px-2.5 text-xs ${isFailed ? 'bg-orange-700 hover:bg-orange-600' : 'bg-green-800 hover:bg-green-700'} text-white`}
                                    onClick={() => markGachaSent(row)} disabled={!wallet || bulkSending}>
                                    {isFailed ? '🔁 再送金' : '💸 送金'}
                                  </Button>
                                )}
                                {isFailed && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => markGachaRetry(row.id)}>待機に戻す</Button>
                                )}
                                {isSending && <span className="text-[10px] text-blue-400 animate-pulse px-1">送金中…</span>}
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* ── 全スピン履歴 ── */}
                {gachaFilter === 'all' && (
                  <>
                    {gachaSpins.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">スピン履歴がありません</p>
                    )}
                    <div className="flex flex-col gap-2">
                      {gachaSpins.map(spin => {
                        const hasInmu = spin.hasInmu
                        const cardBorder = hasInmu && spin.inmuSentStatus === 'pending'
                          ? 'border-yellow-500/40 bg-yellow-950/10'
                          : hasInmu && spin.inmuSentStatus === 'sent'
                            ? 'border-green-500/20'
                            : ''

                        return (
                          <Card key={spin.id} className={`p-3 border-border ${cardBorder}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold">{spin.displayName || spin.userId.slice(0, 12)}</span>
                                  <span className="text-[10px] text-muted-foreground">{spin.pullType === 'multi' ? '10連' : spin.pullType === 'free' ? '無料' : '1連'}</span>
                                  {spin.isFree && <span className="text-[10px] text-emerald-400 px-1 py-0.5 rounded bg-emerald-950/40 border border-emerald-700">🎁 無料</span>}
                                  {spin.wasGuaranteed && <span className="text-[10px] text-yellow-400 px-1 py-0.5 rounded bg-yellow-950/40 border border-yellow-700">✨確定</span>}
                                  {hasInmu && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${spin.inmuSentStatus === 'sent' ? 'text-green-400 border-green-700 bg-green-950/30' : 'text-yellow-300 border-yellow-600 bg-yellow-950/40'}`}>
                                      🏆 INMU ×{spin.inmuCount} {spin.inmuSentStatus === 'sent' ? '送金済' : '未送金'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(spin.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  {spin.costPoints > 0 ? ` — 消費 ${spin.costPoints.toLocaleString()}pt` : ' — 無料ガチャ'}
                                  {spin.totalPoints > 0 && ` / 付与 +${spin.totalPoints.toLocaleString()}pt`}
                                </p>
                                {spin.results.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {spin.results.map((r, i) => (
                                      <span key={i} className={`text-[9px] px-1 py-0.5 rounded border ${r.type === 'inmu' ? 'border-yellow-600 text-yellow-300 bg-yellow-950/30' : 'border-border text-muted-foreground'}`}>
                                        {r.label}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )
          })()}
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
