import { describe, expect, it } from "vitest"
import { viemAnchorer } from "../server/anchor.js"
import { decodeAnchorData } from "../shared/anchor.js"

// Real transactions against a local EVM dev chain (chain id 31337); no testnet or funds involved.
// Skipped when nothing is listening. Start Anvil with:
//   docker run --rm -p 8545:8545 ghcr.io/foundry-rs/foundry "anvil --host 0.0.0.0"
const RPC = process.env.LOCAL_CHAIN_RPC ?? "http://127.0.0.1:8545"
// Anvil's first well-known dev account. Public, worthless, never used outside local tests.
const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const up = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) }).then((r) => r.ok, () => false)

const rpc = async (method: string, params: unknown[]) =>
  (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result

describe.skipIf(!up)("viem anchorer against a local chain", () => {
  const FORM = "0b8f2c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b"
  const ROOT = "20484419864871076248889695620103700070958360513766148129903329916004809489166"

  it("sends a self-transaction carrying the root as calldata", async () => {
    const anchorer = viemAnchorer({ privateKey: DEV_KEY, rpcUrl: RPC, chain: "local" })
    const tx = await anchorer.anchor(FORM, ROOT)
    expect(tx).toMatch(/^0x[0-9a-f]{64}$/)
    const onChain = await rpc("eth_getTransactionByHash", [tx])
    expect(onChain.from.toLowerCase()).toBe(onChain.to.toLowerCase())
    expect(BigInt(onChain.value)).toBe(0n)
    expect(decodeAnchorData(onChain.input)).toEqual({ formId: FORM, root: ROOT })
  })

  it("can send several anchors back to back (nonce handling)", async () => {
    const anchorer = viemAnchorer({ privateKey: DEV_KEY, rpcUrl: RPC, chain: "local" })
    const txs = [await anchorer.anchor(FORM, "1"), await anchorer.anchor(FORM, "2"), await anchorer.anchor(FORM, "3")]
    expect(new Set(txs).size).toBe(3)
  })
})

describe("viemAnchorer configuration", () => {
  it("rejects unknown chains and malformed keys", () => {
    expect(() => viemAnchorer({ privateKey: DEV_KEY, chain: "mainnet" })).toThrow(/unsupported/)
    expect(() => viemAnchorer({ privateKey: "0x12", chain: "sepolia" })).toThrow(/32-byte/)
  })
})
