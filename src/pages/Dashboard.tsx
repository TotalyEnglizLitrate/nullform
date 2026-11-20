import { useCallback, useEffect, useState } from "react"
import { SignIn } from "../SignIn.js"
import { explain, post } from "../lib/api.js"
import { explorerTx } from "../lib/audit.js"
import { href } from "../lib/router.js"
import { useSession } from "../lib/session.js"
import { supabase } from "../lib/supabase.js"
import type { Form } from "../lib/types.js"

type Action = "open" | "freeze" | "anchor" | "close"

export function Dashboard() {
  const session = useSession()
  const [forms, setForms] = useState<Form[] | null>(null)
  const [note, setNote] = useState<{ id: string; text: string; error?: boolean } | null>(null)
  const token = session?.access_token

  const load = useCallback(async () => {
    const { data } = await supabase.from("forms").select("*").order("created_at", { ascending: false })
    setForms(((data ?? []) as Form[]).filter((f) => f.owner_id === session?.user.id))
  }, [session?.user.id])
  useEffect(() => { if (session) void load() }, [session, load])

  async function act(form: Form, action: Action) {
    try {
      const r = await post<{ leafCount?: number; smallGroupWarning?: boolean; anchored?: boolean; anchorProblem?: string }>(
        "lifecycle", { formId: form.id, action }, token)
      const parts: string[] = []
      if (action === "freeze") {
        if (r.smallGroupWarning) parts.push(`Frozen with only ${r.leafCount} member(s). Below ${form.min_group_size}, anonymity is weak.`)
        else parts.push("Frozen.")
        if (!r.anchored) parts.push(r.anchorProblem === "not_configured"
          ? "Anchoring isn't configured, so the root has no on-chain timestamp."
          : "The on-chain anchor failed. Use \"Anchor now\" to retry.")
      } else parts.push("Done.")
      setNote({ id: form.id, text: parts.join(" ") })
    } catch (e) {
      const problems = (e as { body?: { problems?: string[] } }).body?.problems
      setNote({ id: form.id, text: problems ? problems.join("; ") : explain(e), error: true })
    }
    await load()
  }

  if (session === undefined) return null
  if (!session) return <><h1>My forms</h1><p>Sign in to create and manage forms.</p><SignIn /></>

  return (
    <>
      <h1>My forms</h1>
      <p><a href={href("/new")}>New form</a></p>
      {forms === null ? <p className="muted">Loading…</p> : forms.length === 0 ? <p className="muted">No forms yet.</p> : null}
      {forms?.map((f) => (
        <div className="card" key={f.id}>
          <div className="row">
            <strong className="grow">{f.title}</strong>
            <span className="badge">{f.status}</span>
          </div>
          <div className="row">
            <a href={href(`/f/${f.id}`)}>Open page</a>
            {f.status === "draft" && <><a href={href(`/edit/${f.id}`)}>Edit</a>
              <button onClick={() => act(f, "open")}>Open registration</button></>}
            {f.status === "registration" && <button onClick={() => act(f, "freeze")}>Freeze group</button>}
            {(f.status === "frozen" || f.status === "closed") && f.root && <a href={href(`/audit/${f.id}`)}>Audit</a>}
            {(f.status === "frozen" || f.status === "closed") && f.root && !f.anchor_tx &&
              <button onClick={() => act(f, "anchor")}>Anchor now</button>}
            {f.anchor_tx && (explorerTx(f.anchor_chain, f.anchor_tx)
              ? <a href={explorerTx(f.anchor_chain, f.anchor_tx)!} target="_blank" rel="noreferrer">Anchor tx</a>
              : <span className="badge">anchored ({f.anchor_chain})</span>)}
            {(f.status === "registration" || f.status === "frozen") && <button onClick={() => act(f, "close")}>Close</button>}
          </div>
          {note?.id === f.id && <p className={note.error ? "error" : "muted"} role="status">{note.text}</p>}
        </div>
      ))}
    </>
  )
}
