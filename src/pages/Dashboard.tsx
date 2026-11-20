import { useCallback, useEffect, useState } from "react"
import { SignIn } from "../SignIn.js"
import { explain, post } from "../lib/api.js"
import { href } from "../lib/router.js"
import { useSession } from "../lib/session.js"
import { supabase } from "../lib/supabase.js"
import type { Form } from "../lib/types.js"

type Action = "open" | "freeze" | "close"

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
      const r = await post<{ leafCount?: number; smallGroupWarning?: boolean; problems?: string[] }>(
        "lifecycle", { formId: form.id, action }, token)
      setNote({
        id: form.id,
        text: r.smallGroupWarning
          ? `Frozen with only ${r.leafCount} member(s). Below ${form.min_group_size}, anonymity is weak.`
          : "Done.",
      })
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
            {(f.status === "registration" || f.status === "frozen") && <button onClick={() => act(f, "close")}>Close</button>}
          </div>
          {note?.id === f.id && <p className={note.error ? "error" : "muted"} role="status">{note.text}</p>}
        </div>
      ))}
    </>
  )
}
