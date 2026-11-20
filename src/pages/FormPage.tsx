import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase.js"
import { useSession } from "../lib/session.js"
import type { Form } from "../lib/types.js"
import { Register } from "./Register.js"
import { Submit } from "./Submit.js"

export function FormPage({ formId }: { formId: string }) {
  const session = useSession()
  const [form, setForm] = useState<Form | null | undefined>(undefined)

  useEffect(() => {
    if (session === undefined) return
    void supabase.from("forms").select("*").eq("id", formId).maybeSingle().then(({ data }) => setForm((data as Form | null) ?? null))
  }, [formId, session])

  if (form === undefined) return <p className="muted">Loading…</p>
  if (form === null) return <><h1>Form not found</h1><p className="muted">It may not exist, or it's still a draft.</p></>

  return (
    <>
      <h1>{form.title}</h1>
      <p><span className="badge">{form.status}</span> <span className="muted">
        {form.leaf_count !== null && `${form.leaf_count} members · `}{form.schema.questions.length} question(s)</span></p>
      {form.status === "draft" && <p className="muted">Draft: only you can see this.</p>}
      {form.status === "registration" && <Register form={form} />}
      {form.status === "frozen" && form.root && <Submit form={form} />}
      {form.status === "frozen" && !form.root && <p className="muted">The group is being finalized. Refresh in a moment.</p>}
      {form.status === "closed" && <p>This form is closed.</p>}
    </>
  )
}
