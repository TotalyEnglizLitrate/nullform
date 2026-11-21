import { ANCHOR_COLUMNS, toAnchorRecords, type AnchorRecord, type AnchorRow } from "../../shared/anchors.js"
import { supabase } from "./supabase.js"

const PAGE = 1000 // PostgREST's row cap per request

/** Reads every anchored form with the public key; row-level security already makes these rows public. */
export async function fetchAnchors(): Promise<AnchorRecord[]> {
  const rows: AnchorRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("forms").select(ANCHOR_COLUMNS)
      .not("anchor_tx", "is", null).order("id").range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as unknown as AnchorRow[]))
    if (data.length < PAGE) return toAnchorRecords(rows)
  }
}
