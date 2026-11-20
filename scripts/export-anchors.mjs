// Exports every anchored form's public anchor record to anchors.json.
// Commit the output to a public repo as a mirror: if the testnet is ever retired, the
// roots and transaction hashes survive independently of this app's database.
//
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/export-anchors.mjs > anchors.json
//
// Uses only public data (the publishable key and RLS), so anyone can run it.
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY")
  process.exit(1)
}

const columns = "id,root,leaf_count,schema_hash,merkle_depth,anchor_chain,anchor_tx"
const rows = []
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${url}/rest/v1/forms?select=${columns}&anchor_tx=not.is.null&order=id`, {
    headers: { apikey: key, range: `${from}-${from + 999}` },
  })
  if (!res.ok) {
    console.error(`request failed: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  const page = await res.json()
  rows.push(...page)
  if (page.length < 1000) break
}

const anchors = rows.map((r) => ({
  formId: r.id,
  root: r.root,
  leafCount: r.leaf_count,
  schemaHash: r.schema_hash,
  merkleDepth: r.merkle_depth,
  chain: r.anchor_chain,
  tx: r.anchor_tx,
}))
process.stdout.write(`${JSON.stringify(anchors, null, 2)}\n`)
