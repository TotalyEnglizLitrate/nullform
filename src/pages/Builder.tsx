import { useEffect, useState } from "react"
import { Busy } from "../Busy.js"
import { SignIn } from "../SignIn.js"
import { go } from "../lib/router.js"
import { useSession } from "../lib/session.js"
import { supabase } from "../lib/supabase.js"
import type { Form } from "../lib/types.js"
import { validateSchema, type Question } from "../../shared/schema.js"

type QType = Question["type"]
/** Editable shape: everything is a string or boolean so inputs stay simple. */
interface EQ {
  type: QType; label: string; required: boolean
  options: string // one per line
  multiline: boolean; maxLength: string
  minSelected: string; maxSelected: string
  ratingMax: string
  min: string; max: string; integerOnly: boolean
}

const blank = (type: QType = "text"): EQ => ({
  type, label: "", required: false, options: "Option 1\nOption 2", multiline: false, maxLength: "",
  minSelected: "", maxSelected: "", ratingMax: "5", min: "", max: "", integerOnly: false,
})

const num = (s: string) => (s.trim() === "" ? undefined : Number(s))
const opts = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).map((label, i) => ({ id: `o${i + 1}`, label }))

function toQuestion(e: EQ, i: number): Question {
  const base = { id: `q${i + 1}`, label: e.label.trim(), required: e.required }
  switch (e.type) {
    case "text": return { ...base, type: "text", multiline: e.multiline, maxLength: num(e.maxLength) }
    case "single": return { ...base, type: "single", options: opts(e.options) }
    case "multi": return { ...base, type: "multi", options: opts(e.options), minSelected: num(e.minSelected), maxSelected: num(e.maxSelected) }
    case "rating": return { ...base, type: "rating", max: num(e.ratingMax) }
    case "number": return { ...base, type: "number", min: num(e.min), max: num(e.max), integerOnly: e.integerOnly }
  }
}

function toEditor(q: Question): EQ {
  const e = { ...blank(q.type), label: q.label, required: q.required }
  if (q.type === "text") return { ...e, multiline: !!q.multiline, maxLength: q.maxLength?.toString() ?? "" }
  if (q.type === "single") return { ...e, options: q.options.map((o) => o.label).join("\n") }
  if (q.type === "multi") return { ...e, options: q.options.map((o) => o.label).join("\n"),
    minSelected: q.minSelected?.toString() ?? "", maxSelected: q.maxSelected?.toString() ?? "" }
  if (q.type === "rating") return { ...e, ratingMax: q.max?.toString() ?? "5" }
  return { ...e, min: q.min?.toString() ?? "", max: q.max?.toString() ?? "", integerOnly: !!q.integerOnly }
}

const stripUndefined = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export function Builder({ formId }: { formId?: string }) {
  const session = useSession()
  const [title, setTitle] = useState("")
  const [qs, setQs] = useState<EQ[]>([blank()])
  const [provider, setProvider] = useState<"email" | "github">("email")
  const [mode, setMode] = useState("allowlist")
  const [stripPlus, setStripPlus] = useState(false)
  const [allowlist, setAllowlist] = useState("")
  const [opensAt, setOpensAt] = useState("")
  const [minGroup, setMinGroup] = useState("20")
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!formId || !session) return
    void (async () => {
      const { data } = await supabase.from("forms").select("*").eq("id", formId).single()
      const f = data as Form | null
      if (!f || f.status !== "draft") return go("/dashboard")
      setTitle(f.title); setQs(f.schema.questions.map(toEditor))
      setProvider(f.eligibility.provider); setMode(f.eligibility.mode)
      setStripPlus(f.eligibility.provider === "email" && !!f.eligibility.stripPlusTag)
      setMinGroup(String(f.min_group_size))
      setOpensAt(f.opens_at ? new Date(f.opens_at).toISOString().slice(0, 16) : "")
      const al = await supabase.from("form_allowlist").select("entry").eq("form_id", formId)
      setAllowlist((al.data ?? []).map((r) => r.entry).join("\n"))
    })()
  }, [formId, session])

  if (session === undefined) return null
  if (!session) return <><h1>New form</h1><p>Sign in to create forms.</p><SignIn /></>

  const update = (i: number, patch: Partial<EQ>) => setQs((a) => a.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  const setProv = (p: "email" | "github") => { setProvider(p); setMode("allowlist") }

  async function save() {
    const schema = stripUndefined({ questions: qs.map(toQuestion) })
    const found = validateSchema(schema)
    if (!title.trim()) found.unshift("Give the form a title")
    const entries = [...new Set(allowlist.split("\n").map((l) => l.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))]
    if (mode !== "any" && entries.length === 0) found.push("Add at least one allowlist entry")
    setProblems(found)
    if (found.length) return
    setBusy(true)
    const row = {
      title: title.trim(), schema, min_group_size: Number(minGroup) || 20,
      opens_at: opensAt ? new Date(opensAt).toISOString() : null,
      eligibility: provider === "email" ? { provider, mode, stripPlusTag: stripPlus } : { provider, mode },
    }
    let id = formId
    const res = id
      ? await supabase.from("forms").update(row).eq("id", id)
      : await supabase.from("forms").insert({ ...row, owner_id: session!.user.id }).select("id").single()
    if (res.error) { setBusy(false); return setProblems([res.error.message]) }
    if (!id) id = (res.data as { id: string }).id
    await supabase.from("form_allowlist").delete().eq("form_id", id)
    if (mode !== "any") {
      const ins = await supabase.from("form_allowlist").insert(entries.map((entry) => ({ form_id: id, entry })))
      if (ins.error) { setBusy(false); return setProblems([ins.error.message]) }
    }
    go("/dashboard")
  }

  const hasOptions = (t: QType) => t === "single" || t === "multi"
  return (
    <>
      <h1>{formId ? "Edit form" : "New form"}</h1>
      <label htmlFor="title">Title</label>
      <input id="title" type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />

      <h2>Questions</h2>
      {qs.map((q, i) => (
        <fieldset key={i}>
          <legend>Question {i + 1}</legend>
          <label htmlFor={`l${i}`}>Question text</label>
          <input id={`l${i}`} type="text" value={q.label} onChange={(e) => update(i, { label: e.target.value })} />
          <div className="row">
            <div className="grow">
              <label htmlFor={`t${i}`}>Type</label>
              <select id={`t${i}`} value={q.type} onChange={(e) => update(i, { type: e.target.value as QType })}>
                <option value="text">Text</option><option value="single">Single choice</option>
                <option value="multi">Multiple choice</option><option value="rating">Rating</option>
                <option value="number">Number</option>
              </select>
            </div>
          </div>
          <label className="inline"><input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} /> Required</label>
          {q.type === "text" && <>
            <label className="inline"><input type="checkbox" checked={q.multiline} onChange={(e) => update(i, { multiline: e.target.checked })} /> Multiline</label>
            <label htmlFor={`ml${i}`}>Max length (default 1000)</label>
            <input id={`ml${i}`} type="number" min={1} max={10000} value={q.maxLength} onChange={(e) => update(i, { maxLength: e.target.value })} />
          </>}
          {hasOptions(q.type) && <>
            <label htmlFor={`o${i}`}>Options (one per line)</label>
            <textarea id={`o${i}`} value={q.options} onChange={(e) => update(i, { options: e.target.value })} />
          </>}
          {q.type === "multi" && <div className="row">
            <div className="grow"><label htmlFor={`mn${i}`}>Min selected</label>
              <input id={`mn${i}`} type="number" min={0} value={q.minSelected} onChange={(e) => update(i, { minSelected: e.target.value })} /></div>
            <div className="grow"><label htmlFor={`mx${i}`}>Max selected</label>
              <input id={`mx${i}`} type="number" min={1} value={q.maxSelected} onChange={(e) => update(i, { maxSelected: e.target.value })} /></div>
          </div>}
          {q.type === "rating" && <>
            <label htmlFor={`rm${i}`}>Scale: 1 to</label>
            <select id={`rm${i}`} value={q.ratingMax} onChange={(e) => update(i, { ratingMax: e.target.value })}>
              {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n}>{n}</option>)}
            </select>
          </>}
          {q.type === "number" && <div className="row">
            <div className="grow"><label htmlFor={`nmin${i}`}>Min</label>
              <input id={`nmin${i}`} type="number" value={q.min} onChange={(e) => update(i, { min: e.target.value })} /></div>
            <div className="grow"><label htmlFor={`nmax${i}`}>Max</label>
              <input id={`nmax${i}`} type="number" value={q.max} onChange={(e) => update(i, { max: e.target.value })} /></div>
            <label className="inline"><input type="checkbox" checked={q.integerOnly} onChange={(e) => update(i, { integerOnly: e.target.checked })} /> Whole numbers only</label>
          </div>}
          <p className="row">
            <button type="button" disabled={i === 0} onClick={() => setQs((a) => { const b = [...a]; [b[i - 1], b[i]] = [b[i]!, b[i - 1]!]; return b })}>Move up</button>
            <button type="button" disabled={qs.length === 1} onClick={() => setQs((a) => a.filter((_, j) => j !== i))}>Remove</button>
          </p>
        </fieldset>
      ))}
      <button type="button" disabled={qs.length >= 50} onClick={() => setQs((a) => [...a, blank()])}>Add question</button>

      <h2>Who can register</h2>
      <p className="muted">One sign-in method per form, so nobody can register twice through two methods.</p>
      <label htmlFor="prov">Sign-in method</label>
      <select id="prov" value={provider} onChange={(e) => setProv(e.target.value as "email" | "github")}>
        <option value="email">Email code</option><option value="github">GitHub</option>
      </select>
      <label htmlFor="mode">Eligibility</label>
      <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="allowlist">{provider === "email" ? "Specific email addresses" : "Specific GitHub usernames"}</option>
        {provider === "email" && <option value="domain">Anyone at an email domain</option>}
        <option value="any">Anyone with a verified account</option>
      </select>
      {mode === "any" && <p className="error">With "anyone", one person can register many times with throwaway accounts. Use an allowlist for anything that matters.</p>}
      {mode !== "any" && <>
        <label htmlFor="al">{mode === "domain" ? "Domains (one per line)" : provider === "email" ? "Email addresses (one per line)" : "GitHub usernames (one per line)"}</label>
        <textarea id="al" value={allowlist} onChange={(e) => setAllowlist(e.target.value)} />
      </>}
      {provider === "email" && mode === "allowlist" &&
        <label className="inline"><input type="checkbox" checked={stripPlus} onChange={(e) => setStripPlus(e.target.checked)} /> Treat name+tag@… as name@…</label>}

      <h2>Timing and size</h2>
      <label htmlFor="opens">Submissions open at (optional; default is a delay after you freeze)</label>
      <input id="opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
      <label htmlFor="min">Warn me if fewer than this many people register</label>
      <input id="min" type="number" min={1} value={minGroup} onChange={(e) => setMinGroup(e.target.value)} />

      {problems.length > 0 && <ul className="error" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <p className="row"><button className="primary" disabled={busy} aria-busy={busy} onClick={save}><Busy busy={busy} idle="Save draft" doing="Saving" /></button>
        <button onClick={() => go("/dashboard")}>Cancel</button></p>
    </>
  )
}
