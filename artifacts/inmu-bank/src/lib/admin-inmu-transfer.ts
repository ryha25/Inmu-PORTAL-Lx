import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import { confirmSignaturePolling } from '@/lib/solana-confirm'

type PhantomProvider = {
  isPhantom: boolean
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  signTransaction(transaction: Transaction): Promise<Transaction>
}

const INMU_MINT = new PublicKey('4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump')
const INMU_DECIMALS = 6

export function getPhantomProvider(): PhantomProvider | null {
  const browser = window as Window & {
    phantom?: { solana?: PhantomProvider }
    solana?: PhantomProvider
  }
  if (browser.phantom?.solana?.isPhantom) return browser.phantom.solana
  if (browser.solana?.isPhantom) return browser.solana
  return null
}

export function isMobileBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export function openInPhantomBrowser() {
  const url = encodeURIComponent(window.location.href)
  const ref = encodeURIComponent(window.location.origin)
  const deepLink = `phantom://browse/${url}?ref=${ref}`
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.location.assign(deepLink)
    return
  }
  window.location.assign(`intent://browse/${url}#Intent;scheme=phantom;package=app.phantom;end`)
}

export async function fetchInmuBalanceForWallet(wallet: string): Promise<number> {
  if (!wallet) return 0
  const response = await fetch(`/api/solana/inmu-balance?wallet=${encodeURIComponent(wallet)}`, {
    credentials: 'include',
  })
  const data = await response.json().catch(() => ({})) as { balance?: number; error?: string }
  if (!response.ok) throw new Error(data.error ?? 'INMU残高を取得できませんでした')
  return Number(data.balance ?? 0)
}

export async function fetchMyInmuBalance(): Promise<number> {
  const response = await fetch('/api/pet-commerce/inmu-balance', { credentials: 'include' })
  const data = await response.json().catch(() => ({})) as { balance?: number; error?: string }
  if (!response.ok) throw new Error(data.error ?? 'INMU残高を取得できませんでした')
  return Number(data.balance ?? 0)
}

export async function fetchConnectedPhantomInmuBalance(connect = false): Promise<number | null> {
  const phantom = getPhantomProvider()
  if (!phantom) return null
  try {
    const response = await phantom.connect(connect ? undefined : { onlyIfTrusted: true })
    return await fetchInmuBalanceForWallet(response.publicKey.toString())
  } catch {
    return null
  }
}

export async function sendInmuWithPhantom(
  wallet: string,
  amount: number,
  onProgress?: (message: string) => void,
) {
  const phantom = getPhantomProvider()
  if (!phantom) throw new Error('Phantomウォレットが見つかりません')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('送金枚数が不正です')

  onProgress?.('Phantomに接続しています...')
  const response = await phantom.connect()
  const from = new PublicKey(response.publicKey.toString())
  const to = new PublicKey(wallet)
  const connection = new Connection(`${window.location.origin}/api/solana/rpc-proxy`, 'confirmed')
  const fromAta = await getAssociatedTokenAddress(INMU_MINT, from, false, TOKEN_2022_PROGRAM_ID)
  const toAta = await getAssociatedTokenAddress(INMU_MINT, to, false, TOKEN_2022_PROGRAM_ID)
  const rawAmount = BigInt(Math.round(amount * 10 ** INMU_DECIMALS))

  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(from, toAta, to, INMU_MINT, TOKEN_2022_PROGRAM_ID),
    createTransferInstruction(fromAta, toAta, from, rawAmount, [], TOKEN_2022_PROGRAM_ID),
  )
  transaction.feePayer = from
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed')
  transaction.recentBlockhash = blockhash

  onProgress?.('Phantomで署名してください...')
  const signed = await phantom.signTransaction(transaction)
  onProgress?.('Solanaへ送信しています...')
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
    maxRetries: 5,
  })

  // オンチェーンでの確定を待ってから成功として扱う（未確定・失敗TXを送金済みとして
  // 記録してしまうのを防ぐ。ハッシュだけ発行されて実際には送られていない状態を防止）
  onProgress?.('オンチェーンでの確定を待っています...')
  const confirmation = await confirmSignaturePolling(connection, signature, lastValidBlockHeight)
  if (confirmation.err) {
    throw new Error(`トランザクションがオンチェーンで失敗しました: ${JSON.stringify(confirmation.err)}`)
  }

  onProgress?.('送信完了。サーバーで確認しています...')
  return signature
}
