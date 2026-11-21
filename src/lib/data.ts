import { supabase } from "./supabase.js"

const PAGE = 1000 // PostgREST's default row cap; a depth-10 group can hold 1024 leaves

/** Reads every row of a per-form table (answers only return rows to the form's owner, via RLS), paging past the server's row cap in a stable order. */
export async function fetchAll<T>(table: "commitments" | "receipts" | "answers", columns: string, formId: string, order: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).eq("form_id", formId)
      .order(order).range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as unknown as T[]))
    if (data.length < PAGE) return rows
  }
}

export const fetchLeaves = async (formId: string) =>
  (await fetchAll<{ commitment: string }>("commitments", "commitment", formId, "commitment")).map((r) => r.commitment)
