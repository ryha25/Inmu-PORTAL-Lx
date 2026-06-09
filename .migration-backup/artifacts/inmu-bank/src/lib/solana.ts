const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com'
const INMU_TOKEN_MINT = import.meta.env.VITE_INMU_TOKEN_MINT ?? ''
const INMU_DECIMALS = Number(import.meta.env.VITE_INMU_TOKEN_DECIMALS ?? '6')

type RpcResponse<T> = { result?: { value?: T }; error?: { message: string } }

type TokenAccount = {
  account: {
    data: {
      parsed: {
        info: {
          tokenAmount: {
            amount: string
            decimals: number
            uiAmount: number | null
          }
        }
      }
    }
  }
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const data: RpcResponse<T> = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.result?.value as T
}

export async function fetchInmuTokenBalance(walletAddress: string): Promise<number> {
  if (!INMU_TOKEN_MINT) {
    console.warn('[Solana] VITE_INMU_TOKEN_MINT is not set — returning 0')
    return 0
  }

  try {
    const accounts = await rpc<TokenAccount[]>('getTokenAccountsByOwner', [
      walletAddress,
      { mint: INMU_TOKEN_MINT },
      { encoding: 'jsonParsed' },
    ])

    if (!accounts || accounts.length === 0) return 0

    const totalRaw = accounts.reduce((sum, acct) => {
      const raw = acct.account.data.parsed.info.tokenAmount.amount
      return sum + Number(raw)
    }, 0)

    return totalRaw / Math.pow(10, INMU_DECIMALS)
  } catch (e) {
    console.error('[Solana] Failed to fetch INMU token balance:', e)
    return 0
  }
}
