// Read-only JSON-RPC straight from the browser: no wallet, no SDK, no dependency.
const RPC: Record<string, string> = {
  sepolia: (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) || "https://ethereum-sepolia-rpc.publicnode.com",
  local: "http://127.0.0.1:8545",
}

export interface AnchorTx {
  from: string
  to: string | null
  input: string
  blockNumber: string | null
  /** Unix seconds of the block, once mined. */
  timestamp: number | null
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
  const body = await res.json()
  if (body.error) throw new Error(body.error.message ?? "RPC error")
  return body.result as T
}

/** Looks the transaction up on the chain. null means the node doesn't know it. */
export async function fetchAnchorTx(chain: string, tx: string): Promise<AnchorTx | null> {
  const url = RPC[chain]
  if (!url) throw new Error(`No RPC configured for chain "${chain}"`)
  const t = await rpc<{ from: string; to: string | null; input: string; blockNumber: string | null } | null>(
    url, "eth_getTransactionByHash", [tx])
  if (!t) return null
  let timestamp: number | null = null
  if (t.blockNumber) {
    const block = await rpc<{ timestamp: string } | null>(url, "eth_getBlockByNumber", [t.blockNumber, false])
    if (block) timestamp = Number(BigInt(block.timestamp))
  }
  return { from: t.from, to: t.to, input: t.input, blockNumber: t.blockNumber, timestamp }
}
