import { Group } from "@semaphore-protocol/group"
import { decodeAnchorData } from "../../shared/anchor.js"
import { scopeFromFormId } from "../../shared/hash.js"
import { isCommitment, isFieldElement, sortLeaves } from "../../shared/leaves.js"
import type { Proof } from "./prover.js"
import type { AnchorTx } from "./chain.js"
import type { Form } from "./types.js"

export interface Receipt {
  nullifier: string
  signal: string
  proof: Proof
  submitted_hour: string
}

export interface Check {
  name: string
  ok: boolean
  detail?: string
}

/** Rebuilds the Merkle root from the public leaf list, exactly as the server did at freeze. */
export const computeRoot = (leaves: string[]): string => new Group(sortLeaves(leaves)).root.toString()

/** Everything a reader can check about the group from public data alone. */
export function checkGroup(form: Pick<Form, "root" | "leaf_count">, leaves: string[]): Check[] {
  const unique = new Set(leaves).size === leaves.length
  const valid = leaves.every(isCommitment)
  const checks: Check[] = [
    { name: "Leaf count matches the published count", ok: leaves.length === form.leaf_count, detail: `${leaves.length} leaves, ${form.leaf_count} published` },
    { name: "Every leaf is a valid commitment", ok: valid },
    { name: "No leaf appears twice", ok: unique },
  ]
  if (valid && leaves.length > 0) {
    const root = computeRoot(leaves)
    checks.push({ name: "Rebuilt root equals the published root", ok: root === form.root, detail: root })
  } else checks.push({ name: "Rebuilt root equals the published root", ok: false, detail: "leaves unusable" })
  return checks
}

/**
 * The cheap, non-cryptographic checks tying a receipt to this form and its group.
 * Returns a problem description, or null. (The zero-knowledge proof itself is verified separately.)
 */
export async function checkBinding(form: Pick<Form, "id" | "root" | "merkle_depth">, r: Receipt): Promise<string | null> {
  const p = r.proof
  if (!isFieldElement(r.nullifier)) return "nullifier is not written as a canonical number"
  if (p.merkleTreeRoot !== form.root) return "proof is for a different group root"
  if (p.merkleTreeDepth !== form.merkle_depth) return "wrong tree depth"
  if (p.scope !== (await scopeFromFormId(form.id))) return "proof is for a different form"
  if (p.message !== r.signal) return "signal does not match the proof"
  if (p.nullifier !== r.nullifier) return "nullifier does not match the proof"
  return null
}

const EXPLORERS: Record<string, string> = { sepolia: "https://sepolia.etherscan.io/tx/" }
export const explorerTx = (chain: string | null, tx: string | null) =>
  chain && tx && EXPLORERS[chain] ? `${EXPLORERS[chain]}${tx}` : null

/** Checks an on-chain anchor transaction against the published form and root. */
export function checkAnchor(
  form: Pick<Form, "id" | "root">,
  tx: AnchorTx | null,
  expectedSender?: string,
): Check[] {
  if (!tx) return [{ name: "Transaction found on the chain", ok: false, detail: "the node does not know this transaction" }]
  const data = decodeAnchorData(tx.input)
  const checks: Check[] = [
    { name: "Transaction found on the chain", ok: true },
    { name: "Transaction is confirmed in a block", ok: tx.blockNumber !== null, detail: tx.blockNumber ? undefined : "still pending" },
    { name: "Calldata is a NullForm anchor", ok: data !== null },
    { name: "Anchor is for this form", ok: data?.formId === form.id },
    { name: "Anchored root equals the published root", ok: data !== null && data.root === form.root, detail: data?.root },
    { name: "Sent from the wallet to itself", ok: tx.to !== null && tx.to.toLowerCase() === tx.from.toLowerCase() },
  ]
  if (expectedSender) checks.push({ name: "Sent by the expected anchor wallet", ok: tx.from.toLowerCase() === expectedSender.toLowerCase(), detail: tx.from })
  return checks
}

/**
 * Indexes of receipts whose nullifier is numerically the same as another receipt's. Each member gets exactly one
 * nullifier per form, so a repeat means a double submission got through, however the number was spelled.
 */
export function duplicateNullifiers(receipts: Pick<Receipt, "nullifier">[]): Set<number> {
  const byValue = new Map<string, number[]>()
  receipts.forEach((r, i) => {
    let key: string
    try { key = BigInt(r.nullifier).toString() } catch { key = `text:${r.nullifier}` }
    byValue.set(key, [...(byValue.get(key) ?? []), i])
  })
  return new Set([...byValue.values()].filter((g) => g.length > 1).flat())
}
