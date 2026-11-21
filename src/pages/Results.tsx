import { useEffect, useMemo, useState } from "react"
import { SignIn } from "../SignIn.js"
import { fetchAll } from "../lib/data.js"
import { href } from "../lib/router.js"
import { aggregate, toCsv, type QuestionStats } from "../lib/results.js"
import { useSession } from "../lib/session.js"
import { supabase } from "../lib/supabase.js"
import type { Form } from "../lib/types.js"
import type { Payload } from "../../shared/schema.js"

const fmt = (n: number | null) => (n === null ? "none" : Number.isInteger(n) ? String(n) : n.toFixed(2))

/** Horizontal bar built from a div: no chart library, readable without the bar (the count is text). */
function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${pct}%` }} /></span>
      <span className="bar-count">{count} ({pct}%)</span>
    </div>
  )
}

function Stats({ s, total }: { s: QuestionStats; total: number }) {
  return (
    <div className="card">
      <strong>{s.question.label}</strong>
      <p className="muted">{s.answered} of {total} answered</p>
      {s.kind === "choice" && s.options.map((o) => <Bar key={o.id} label={o.label} count={o.count} total={s.answered} />)}
      {s.kind === "rating" && <>
        {s.counts.map((c, i) => <Bar key={i} label={String(i + 1)} count={c} total={s.answered} />)}
        <p>Average: <strong>{fmt(s.mean)}</strong></p>
      </>}
      {s.kind === "number" && <p>Min <strong>{fmt(s.min)}</strong> · Max <strong>{fmt(s.max)}</strong> · Mean <strong>{fmt(s.mean)}</strong></p>}
      {s.kind === "text" && (s.answers.length ? <ul>{s.answers.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="muted">No answers.</p>)}
    </div>
  )
}

export function Results({ formId }: { formId: string }) {
  const session = useSession()
  const [form, setForm] = useState<Form | null | undefined>(undefined)
  const [payloads, setPayloads] = useState<Payload[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!session) return
    void (async () => {
      const { data } = await supabase.from("forms").select("*").eq("id", formId).maybeSingle()
      const f = data as Form | null
      setForm(f)
      if (!f || f.owner_id !== session.user.id) return
      try {
        // Ordered by nullifier (effectively random), never by arrival, so order reveals nothing about timing.
        const rows = await fetchAll<{ payload: Payload }>("answers", "payload", formId, "nullifier")
        setPayloads(rows.map((r) => r.payload))
      } catch (e) { setError(e instanceof Error ? e.message : "Could not load answers") }
    })()
  }, [formId, session])

  const stats = useMemo(() => (form && payloads ? aggregate(form.schema, payloads) : null), [form, payloads])

  if (session === undefined) return null
  if (!session) return <><h1>Results</h1><p>Sign in as the form's owner to see its results.</p><SignIn /></>
  if (form === undefined) return <p className="muted">Loading…</p>
  if (!form || form.owner_id !== session.user.id)
    return <><h1>Results</h1><p className="muted">Only the form's owner can see its answers.</p></>

  const download = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([toCsv(form.schema, payloads!)], { type: "text/csv;charset=utf-8" }))
    a.download = `${form.title.replace(/[^\w-]+/g, "_") || "results"}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const n = payloads?.length ?? 0
  return (
    <>
      <h1>Results: {form.title}</h1>
      <p><a href={href("/dashboard")}>My forms</a> · <a href={href(`/audit/${form.id}`)}>Public audit page</a></p>
      <p className="muted">Only you can see this page. Respondents are anonymous, but free-text answers can identify people by style or detail, so handle them with care.</p>
      {payloads !== null && <>
        <p>
          <strong data-testid="response-count">{n}</strong> response(s) from <strong>{form.leaf_count ?? "?"}</strong> registered member(s)
          {form.leaf_count ? ` (${Math.round((n / form.leaf_count) * 100)}%)` : ""}
        </p>
        {form.leaf_count !== null && form.leaf_count < form.min_group_size &&
          <p className="error">Small group: with {form.leaf_count} members, individual answers are easier to attribute.</p>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      {payloads === null ? <p className="muted">Loading…</p> : <>
        <p><button disabled={!n} onClick={download}>Download CSV</button></p>
        {stats?.map((s) => <Stats key={s.question.id} s={s} total={n} />)}
      </>}
    </>
  )
}
