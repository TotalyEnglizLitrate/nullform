import { Group } from "@semaphore-protocol/group"
import { useEffect, useMemo, useState } from "react"
import { ApiError, explain, post } from "../lib/api.js"
import { deriveIdentity } from "../lib/identity.js"
import { loadMaster } from "../lib/keystore.js"
import { prove, type Proof } from "../lib/prover.js"
import { supabase } from "../lib/supabase.js"
import type { Form } from "../lib/types.js"
import { canonicalize } from "../../shared/canonical.js"
import { scopeFromFormId, sha256Hex, signalFromPayload } from "../../shared/hash.js"
import { sortLeaves } from "../../shared/leaves.js"
import { validatePayload, type Payload, type Question } from "../../shared/schema.js"
import { Backup } from "./Backup.js"

type Answer = string | string[]
type Receipt = { nullifier: string; proofHash: string }

/** Turns raw input state into the exact payload that gets hashed and sent. */
function buildPayload(questions: Question[], answers: Record<string, Answer>): Payload {
  const out: Payload = {}
  for (const q of questions) {
    const a = answers[q.id]
    if (q.type === "text") { const t = ((a as string) ?? "").trim(); if (t) out[q.id] = t }
    else if (q.type === "single") { if (a) out[q.id] = a }
    else if (q.type === "multi") { if (Array.isArray(a) && a.length) out[q.id] = a }
    else if (a !== undefined && a !== "") out[q.id] = Number(a) // rating, number
  }
  return out
}

export function Submit({ form }: { form: Form }) {
  const [leaves, setLeaves] = useState<string[] | null>(null)
  const [master, setMaster] = useState<Uint8Array | null | undefined>(undefined)
  const [commitment, setCommitment] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [step, setStep] = useState<"idle" | "group" | "proof" | "send">("idle")
  const [error, setError] = useState("")
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  const opensAt = form.opens_at ? new Date(form.opens_at) : null
  const notYet = opensAt !== null && opensAt.getTime() > Date.now()

  useEffect(() => { void loadMaster().then(setMaster) }, [])
  useEffect(() => {
    void supabase.from("commitments").select("commitment").eq("form_id", form.id)
      .then(({ data }) => setLeaves((data ?? []).map((r) => r.commitment as string)))
  }, [form.id])
  useEffect(() => {
    if (!master) return setCommitment(null)
    void deriveIdentity(master, form.id).then((i) => setCommitment(i.commitment.toString()))
  }, [master, form.id])

  const inGroup = useMemo(() => !!(leaves && commitment && leaves.includes(commitment)), [leaves, commitment])
  const hasText = form.schema.questions.some((q) => q.type === "text")

  async function send() {
    setError("")
    const payload = buildPayload(form.schema.questions, answers)
    const invalid = validatePayload(form.schema, payload)
    if (invalid) return setError(`Please check your answers (${invalid}).`)
    try {
      setStep("group")
      // Rebuild the group locally and check it against the published root before trusting it.
      const sorted = sortLeaves(leaves!)
      if (new Group(sorted).root.toString() !== form.root) throw new Error("The published group doesn't match its root. Not submitting.")
      const identity = await deriveIdentity(master!, form.id)
      const proof: Proof = await prove(identity, {
        leaves: leaves!, depth: form.merkle_depth,
        message: await signalFromPayload(payload), scope: await scopeFromFormId(form.id),
      }, (s) => setStep(s))
      setStep("send")
      // No Authorization header, no cookies: the proof is the only credential.
      await post("submit", { formId: form.id, payload, proof })
      setReceipt({ nullifier: proof.nullifier, proofHash: await sha256Hex(canonicalize(proof)) })
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? explain(e) : "Something went wrong.")
    }
    setStep("idle")
  }

  if (receipt) return (
    <>
      <h2>Submitted</h2>
      <p className="ok" role="status">Your anonymous answers were received.</p>
      <div className="card">
        <p className="muted">Receipt (public; it doesn't reveal who you are or what you answered)</p>
        <p>Nullifier: <span className="mono">{receipt.nullifier}</span></p>
        <p>Proof hash: <span className="mono">{receipt.proofHash}</span></p>
      </div>
    </>
  )

  return (
    <>
      <h2>Answer anonymously</h2>
      {notYet && <p role="status">Submissions open {opensAt!.toLocaleString()}. The delay after the group froze protects you from timing analysis.</p>}
      {leaves === null || master === undefined ? <p className="muted">Loading…</p>
        : !master ? <><p>This browser has no identity for this form. If you registered elsewhere, restore your backup.</p><Backup onChange={() => void loadMaster().then(setMaster)} /></>
        : !inGroup ? <><p className="error">This browser's identity isn't in the group. Restore the backup from the browser you registered with.</p><Backup onChange={() => void loadMaster().then(setMaster)} /></>
        : (
          <form onSubmit={(e) => { e.preventDefault(); void send() }}>
            <p className="muted">
              Your answers are sent without signing in, together with a proof that you're a registered member.
              {hasText && " Free-text answers can identify you by writing style or detail, so write accordingly."}
              {" "}The form owner can read every answer.
            </p>
            {form.schema.questions.map((q) => (
              <fieldset key={q.id} disabled={notYet || step !== "idle"}>
                <legend>{q.label}{q.required ? " *" : ""}</legend>
                {q.type === "text" && (q.multiline
                  ? <textarea aria-label={q.label} maxLength={q.maxLength ?? 1000} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                  : <input type="text" aria-label={q.label} maxLength={q.maxLength ?? 1000} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />)}
                {q.type === "single" && q.options.map((o) => (
                  <label className="inline" key={o.id}><input type="radio" name={q.id} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))} /> {o.label}</label>))}
                {q.type === "multi" && q.options.map((o) => (
                  <label className="inline" key={o.id}><input type="checkbox" onChange={(e) => setAnswers((a) => {
                    const cur = (a[q.id] as string[] | undefined) ?? []
                    return { ...a, [q.id]: e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id) }
                  })} /> {o.label}</label>))}
                {q.type === "rating" && Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => (
                  <label className="inline" key={n}><input type="radio" name={q.id} onChange={() => setAnswers((a) => ({ ...a, [q.id]: String(n) }))} /> {n}</label>))}
                {q.type === "number" && <input type="number" aria-label={q.label} min={q.min} max={q.max} step={q.integerOnly ? 1 : "any"}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />}
              </fieldset>
            ))}
            {step !== "idle" && <p role="status"><progress /> {step === "group" ? "Checking the group…" : step === "proof" ? "Generating your proof (a few seconds)…" : "Sending…"}</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <p><button className="primary" disabled={notYet || step !== "idle"}>Submit anonymously</button></p>
          </form>
        )}
    </>
  )
}
