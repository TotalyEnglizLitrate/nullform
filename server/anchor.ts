import { createWalletClient, http, type Chain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry, sepolia } from "viem/chains"
import { encodeAnchorData } from "../shared/anchor.js"

/** Publishes a group root somewhere tamper-evident and returns a transaction hash. */
export interface Anchorer {
  /** Short chain name stored in forms.anchor_chain, e.g. "sepolia". */
  chain: string
  anchor(formId: string, root: string): Promise<string>
}

// Chains we accept by name. "local" is an Anvil dev chain, for tests and local development.
const CHAINS: Record<string, Chain> = { sepolia, local: foundry }

/**
 * Sends a zero-value transaction to the anchor wallet itself, carrying the root as calldata.
 * It returns as soon as the node accepts the transaction (no waiting for a block), so a
 * serverless function never sits out a 12-second block time. The audit page checks the chain.
 */
export function viemAnchorer(opts: { privateKey: string; rpcUrl?: string; chain: string }): Anchorer {
  const chain = CHAINS[opts.chain]
  if (!chain) throw new Error(`unsupported anchor chain "${opts.chain}"`)
  if (!/^0x[0-9a-fA-F]{64}$/.test(opts.privateKey)) throw new Error("ANCHOR_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key")
  const account = privateKeyToAccount(opts.privateKey as `0x${string}`)
  const wallet = createWalletClient({ account, chain, transport: http(opts.rpcUrl) })
  return {
    chain: opts.chain,
    anchor: (formId, root) =>
      wallet.sendTransaction({ account, chain, to: account.address, value: 0n, data: encodeAnchorData(formId, root) }),
  }
}

let override: Anchorer | null | undefined

/** Tests inject a fake (or null to simulate "not configured"); pass undefined to go back to env config. */
export const setAnchorer = (a: Anchorer | null | undefined) => void (override = a)

/** The configured anchorer, or null when anchoring is switched off (no key set). */
export function getAnchorer(): Anchorer | null {
  if (override !== undefined) return override
  const privateKey = process.env.ANCHOR_PRIVATE_KEY
  if (!privateKey) return null
  return viemAnchorer({
    privateKey,
    rpcUrl: process.env.ANCHOR_RPC_URL || undefined,
    chain: process.env.ANCHOR_CHAIN ?? "sepolia",
  })
}
