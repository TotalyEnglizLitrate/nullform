import type { Eligibility } from "../../server/providers/types.js"
import type { FormSchema } from "../../shared/schema.js"

export interface Form {
  id: string
  owner_id: string
  title: string
  schema: FormSchema
  status: "draft" | "registration" | "frozen" | "closed"
  eligibility: Eligibility
  min_group_size: number
  merkle_depth: number
  opens_at: string | null
  closes_at: string | null
  schema_hash: string | null
  root: string | null
  leaf_count: number | null
  anchor_chain: string | null
  anchor_tx: string | null
}
