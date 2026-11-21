import { useEffect, useState } from "react"
import { Busy } from "../Busy.js"
import { checkAnchor, checkBinding, duplicateNullifiers, checkGroup, explorerTx, type Check, type Receipt } from "../lib/audit.js"
import { fetchAnchorTx } from "../lib/chain.js"
import { fetchAll, fetchLeaves } from "../lib/data.js"
import { href } from "../lib/router.js"
import { supabase } from "../lib/supabase.js"
import type { Form } from "../lib/types.js"
import { verifyAll } from "../lib/verifier.js"

type RowState = { ok: boolean; why?: string }

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-8)}` : s)

export function Audit({ formId }: { formId: string }) {
  const [form, setForm] = useState<Form | null | undefined>(undefined)
  const [leaves, setLeaves] = useState<string[] | null>(null)
  const [receipts, setReceipts] = useState<Receipt[] | null>(null)
  const [groupChecks, setGroupChecks] = useState<Check[] | null>(null)
  const [rows, setRows] = useState<RowState[] | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [anchorChecks, setAnchorChecks] = useState<Check[] | null>(null)
  const [anchorTime, setAnchorTime] = useState<number | null>(null)
  const [checkingAnchor, setCheckingAnchor] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("forms").select("*").eq("id", formId).maybeSingle()
      const f = data as Form | null
      setForm(f)
      if (!f || (f.status !== "frozen" && f.status !== "closed")) return
      try {
        setLeaves(await fetchLeaves(formId))
        setReceipts(await fetchAll<Receipt>("receipts", "nullifier,signal,proof,submitted_hour", formId, "nullifier"))
      } catch (e) { setError(e instanceof Error ? e.message : "Could not load audit data") }
    })()
  }, [formId])

  if (form === undefined) return <p className="muted">Loading…</p>
  if (form === null) return <h1>Form not found</h1>
  if (form.status !== "frozen" && form.status !== "closed")
    return <><h1>Audit: {form.title}</h1><p className="muted">The audit data is published once the group is frozen.</p></>

  const tx = explorerTx(form.anchor_chain, form.anchor_tx)

  async function verifyReceipts() {
    setError("")
    setProgress(0)
    try {
      const binding = await Promise.all(receipts!.map((r) => checkBinding(form!, r)))
      const proofs = await verifyAll(receipts!.map((r) => r.proof), setProgress)
      const repeats = duplicateNullifiers(receipts!)
      setRows(receipts!.map((_, i) => binding[i] ? { ok: false, why: binding[i]! }
        : repeats.has(i) ? { ok: false, why: "same nullifier as another receipt (a double submission)" }
        : proofs[i] ? { ok: true } : { ok: false, why: "zero-knowledge proof is invalid" }))
    } catch (e) { setError(e instanceof Error ? e.message : "Verification failed") }
    setProgress(null)
  }

  async function verifyAnchor() {
    setError("")
    setCheckingAnchor(true)
    try {
      const t = await fetchAnchorTx(form!.anchor_chain!, form!.anchor_tx!)
      setAnchorChecks(checkAnchor(form!, t, import.meta.env.VITE_ANCHOR_ADDRESS as string | undefined))
      setAnchorTime(t?.timestamp ?? null)
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reach the chain") }
    setCheckingAnchor(false)
  }

  const good = rows?.filter((r) => r.ok).length ?? 0
  const download = () => {
    const blob = new Blob([JSON.stringify({ formId: form.id, root: form.root, depth: form.merkle_depth, leaves, receipts }, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `nullform-audit-${form.id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <h1>Audit: {form.title}</h1>
      <p><a href={href(`/f/${form.id}`)}>Back to the form</a></p>
      <p className="muted">
        Everything on this page is public. Nothing here shows what anyone answered, and nothing can link a
        receipt to a person. Use the buttons to check it yourself, in your browser, rather than trusting us.
      </p>

      <div className="card">
        <p>Status: <strong>{form.status}</strong> · Members: <strong>{form.leaf_count}</strong> · Tree depth: {form.merkle_depth}</p>
        <p>Group root: <span className="mono" data-testid="root">{form.root}</span></p>
        <p>Form schema hash: <span className="mono">{form.schema_hash}</span></p>
        <p>Anchor: {tx ? <a href={tx} target="_blank" rel="noreferrer">view transaction</a> : <span className="muted">not anchored yet</span>}</p>
        {form.leaf_count !== null && form.leaf_count < form.min_group_size &&
          <p className="error">Small group: with {form.leaf_count} members, anonymity is weak.</p>}
      </div>

      <h2>1. Verify the group</h2>
      <p className="muted">Rebuilds the Merkle tree from the published leaves and compares its root to the published one.</p>
      <p><button disabled={!leaves} onClick={() => setGroupChecks(checkGroup(form, leaves!))}>Verify in your browser</button></p>
      {groupChecks && <ul data-testid="group-checks">{groupChecks.map((c) =>
        <li key={c.name} className={c.ok ? "ok" : "error"}>{c.ok ? "Pass" : "Fail"}: {c.name}{c.detail && !c.ok ? ` (${c.detail})` : ""}</li>)}</ul>}
      <details>
        <summary>{leaves?.length ?? 0} leaves (identity commitments, sorted)</summary>
        <p className="mono">{leaves?.map((l) => <span key={l}>{l}<br /></span>)}</p>
      </details>

      <h2>2. Verify the anchor</h2>
      {form.anchor_tx && form.anchor_chain ? <>
        <p className="muted">
          The root was published in a blockchain transaction when the group froze. That makes it a public timestamp:
          the operator can't quietly change the group afterwards. This reads the transaction from the chain and compares it.
        </p>
        <p><button onClick={verifyAnchor} disabled={checkingAnchor} aria-busy={checkingAnchor}><Busy busy={checkingAnchor} idle={`Check the anchor on ${form.anchor_chain}`} doing="Checking the chain" /></button></p>
        {anchorChecks && <ul data-testid="anchor-checks">{anchorChecks.map((c) =>
          <li key={c.name} className={c.ok ? "ok" : "error"}>{c.ok ? "Pass" : "Fail"}: {c.name}{c.detail && !c.ok ? ` (${c.detail})` : ""}</li>)}</ul>}
        {anchorTime && <p className="muted">Anchored {new Date(anchorTime * 1000).toLocaleString()}.</p>}
      </> : <p className="muted">This group has not been anchored on a chain, so its root has no independent timestamp.</p>}

      <h2>3. Verify the submissions</h2>
      <p className="muted">
        {receipts?.length ?? 0} receipt(s). Each is a zero-knowledge proof that the sender belongs to this group.
        Checks run here: the proof is valid, it is for this group and this form, and it matches its published signal.
      </p>
      <p className="row">
        <button disabled={!receipts?.length || progress !== null} onClick={verifyReceipts}>
          Verify all {receipts?.length ?? 0} receipts</button>
        <button disabled={!receipts} onClick={download}>Download audit data (JSON)</button>
      </p>
      {progress !== null && <p role="status"><progress max={receipts!.length} value={progress} /> {progress} / {receipts!.length}</p>}
      {rows && <p role="status" data-testid="receipt-summary" className={good === rows.length ? "ok" : "error"}>
        {good} of {rows.length} receipts valid</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {receipts?.map((r, i) => (
        <div className="card" key={r.nullifier}>
          <div className="row"><span>Nullifier <span className="mono" title={r.nullifier}>{short(r.nullifier)}</span></span>
            <span className="muted grow">{new Date(r.submitted_hour).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
            {rows && <span className={rows[i]!.ok ? "ok" : "error"}>{rows[i]!.ok ? "valid" : `invalid: ${rows[i]!.why}`}</span>}</div>
          <p className="muted mono">signal {short(r.signal)}</p>
        </div>
      ))}
    </>
  )
}
