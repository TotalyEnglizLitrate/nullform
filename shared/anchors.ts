/**
 * The public list of anchored groups ("anchors.json"). Anyone can read it: the fields come from forms that are
 * already public, and nothing here is secret. scripts/export-anchors.mjs writes the same shape from the command line.
 */
export interface AnchorRow {
  id: string
  root: string | null
  leaf_count: number | null
  schema_hash: string | null
  merkle_depth: number
  anchor_chain: string | null
  anchor_tx: string | null
}

export interface AnchorRecord {
  formId: string
  root: string
  leafCount: number | null
  schemaHash: string | null
  merkleDepth: number
  chain: string
  tx: string
}

/** The columns to select from `forms`. */
export const ANCHOR_COLUMNS = "id,root,leaf_count,schema_hash,merkle_depth,anchor_chain,anchor_tx"

/** Keeps only fully anchored forms, in a stable order (by form id), so the file diffs cleanly between exports. */
export function toAnchorRecords(rows: AnchorRow[]): AnchorRecord[] {
  return rows
    .filter((r): r is AnchorRow & { root: string; anchor_chain: string; anchor_tx: string } => !!(r.root && r.anchor_chain && r.anchor_tx))
    .map((r) => ({
      formId: r.id, root: r.root, leafCount: r.leaf_count, schemaHash: r.schema_hash,
      merkleDepth: r.merkle_depth, chain: r.anchor_chain, tx: r.anchor_tx,
    }))
    .sort((a, b) => (a.formId < b.formId ? -1 : a.formId > b.formId ? 1 : 0))
}

export const anchorsJson = (records: AnchorRecord[]) => `${JSON.stringify(records, null, 2)}\n`
