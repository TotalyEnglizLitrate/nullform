import { db } from "./db.js"
import { HttpError, UUID } from "./http.js"
import type { Eligibility } from "./providers/index.js"
import type { FormSchema } from "../shared/schema.js"

export interface FormRow {
  id: string
  owner_id: string
  status: "draft" | "registration" | "frozen" | "closed"
  schema: FormSchema
  eligibility: Eligibility
  merkle_depth: number
  min_group_size: number
  root: string | null
  leaf_count: number | null
}

export async function loadForm(formId: unknown): Promise<FormRow> {
  if (typeof formId !== "string" || !UUID.test(formId)) throw new HttpError(400, "invalid_form_id")
  const { data, error } = await db().from("forms").select("*").eq("id", formId).maybeSingle()
  if (error) {
    console.error(error.message)
    throw new HttpError(500, "internal_error")
  }
  if (!data) throw new HttpError(404, "form_not_found")
  return data as FormRow
}

export async function loadAllowlist(formId: string): Promise<string[]> {
  const { data, error } = await db().from("form_allowlist").select("entry").eq("form_id", formId)
  if (error) throw new HttpError(500, "internal_error")
  return (data ?? []).map((r) => r.entry as string)
}
