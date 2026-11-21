import { useEffect, useState } from "react"
import { anchorsJson, type AnchorRecord } from "../../shared/anchors.js"
import { fetchAnchors } from "../lib/anchors.js"
import { explorerTx } from "../lib/audit.js"
import { href } from "../lib/router.js"

const SHOWN = 20

export function Anchors() {
  const [records, setRecords] = useState<AnchorRecord[] | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetchAnchors().then(setRecords, (e) => setError(e instanceof Error ? e.message : "Could not load the anchors")) }, [])

  const download = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([anchorsJson(records!)], { type: "application/json" }))
    a.download = "anchors.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <h1>Anchors</h1>
      <p>
        When a form's group is frozen, its root (a short fingerprint of the whole member list) is published in a
        blockchain transaction. That makes the group's contents tamper-evident. This is the public list of those
        anchors. Anyone can download it, no sign-in needed. Keep a copy: it is an independent record of which
        transaction belongs to which form, even if this site or the test network disappears.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {records === null && !error && <p className="muted">Loading…</p>}
      {records && <>
        <p>
          <strong data-testid="anchor-count">{records.length}</strong> anchored form(s)
          {" "}<button onClick={download}>Download anchors.json</button>
        </p>
        {records.length === 0 && <p className="muted">No form has been anchored yet. The file would be an empty list.</p>}
        {records.slice(0, SHOWN).map((r) => {
          const tx = explorerTx(r.chain, r.tx)
          return (
            <div className="card" key={r.formId}>
              <div className="row">
                <a href={href(`/audit/${r.formId}`)}>Audit this form</a>
                <span className="badge">{r.chain}</span>
                <span className="muted">{r.leafCount ?? "?"} members</span>
                {tx && <a href={tx} target="_blank" rel="noreferrer">Transaction</a>}
              </div>
              <p className="muted mono">root {r.root}</p>
            </div>
          )
        })}
        {records.length > SHOWN && <p className="muted">Showing {SHOWN} of {records.length}. The download has all of them.</p>}
      </>}
    </>
  )
}
