import type { Connection } from '@solana/web3.js'

export type ConfirmResult = { err: unknown | null; timedOut?: boolean }

/**
 * オンチェーン確定をポーリングで待つ。
 *
 * `connection.confirmTransaction()` はデフォルトで WebSocket 購読
 * (`signatureSubscribe`) を使うが、このアプリの RPC は HTTP のみのプロキシ
 * (`/api/solana/rpc-proxy`) のため WS 購読が使えず、実際には成功している
 * トランザクションでもタイムアウト/エラーとして扱われてしまう
 * （「失敗と出るが実際は送金できている」の原因）。
 *
 * そのため `getSignatureStatuses` を短い間隔でポーリングする方式に統一する。
 * HTTPのみで完結し、WS購読の接続待ち/タイムアウトが無い分、体感速度も速くなる。
 */
export async function confirmSignaturePolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  opts?: { pollIntervalMs?: number; commitment?: 'confirmed' | 'finalized' },
): Promise<ConfirmResult> {
  const pollIntervalMs = opts?.pollIntervalMs ?? 500
  const targetCommitment = opts?.commitment ?? 'confirmed'

  for (;;) {
    let statusResult: Awaited<ReturnType<Connection['getSignatureStatuses']>> | null = null
    try {
      statusResult = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
    } catch {
      // 一時的なRPCエラーは無視してポーリングを継続する
    }

    const status = statusResult?.value?.[0]
    if (status) {
      if (status.err) {
        return { err: status.err }
      }
      const confirmationStatus = status.confirmationStatus
      if (
        confirmationStatus === targetCommitment ||
        confirmationStatus === 'finalized' ||
        (targetCommitment === 'confirmed' && confirmationStatus === undefined && status.confirmations && status.confirmations > 0)
      ) {
        return { err: null }
      }
    }

    let blockHeight: number
    try {
      blockHeight = await connection.getBlockHeight('confirmed')
    } catch {
      blockHeight = -1
    }
    if (blockHeight !== -1 && blockHeight > lastValidBlockHeight) {
      // ブロックハイトが失効を超えた時点で、最後にもう一度だけステータス確認してから諦める
      let finalStatusResult: Awaited<ReturnType<Connection['getSignatureStatuses']>> | null = null
      try {
        finalStatusResult = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
      } catch { /* ignore */ }
      const finalStatus = finalStatusResult?.value?.[0]
      if (finalStatus && !finalStatus.err) {
        return { err: null }
      }
      return { err: finalStatus?.err ?? null, timedOut: !finalStatus }
    }

    await new Promise(r => setTimeout(r, pollIntervalMs))
  }
}
