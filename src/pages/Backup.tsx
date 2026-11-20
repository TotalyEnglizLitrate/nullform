import { useEffect, useState } from "react"
import { decodeBackup, encodeBackup } from "../lib/identity.js"
import { loadMaster, saveMaster } from "../lib/keystore.js"

/** Shows the backup string for this browser's master secret and lets the user restore one. */
export function Backup({ highlight, onChange }: { highlight?: boolean; onChange?: () => void }) {
  const [backup, setBackup] = useState<string | null>(null)
  const [shown, setShown] = useState(!!highlight)
  const [restore, setRestore] = useState("")
  const [msg, setMsg] = useState("")

  useEffect(() => {
    void loadMaster().then(async (m) => setBackup(m ? await encodeBackup(m) : null))
  }, [highlight])

  async function doRestore() {
    try {
      await saveMaster(await decodeBackup(restore))
      setMsg("Restored. Your identities for existing forms are available again.")
      setRestore("")
      setBackup(await encodeBackup((await loadMaster())!))
      onChange?.()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not restore")
    }
  }

  return (
    <details className="card" open={highlight}>
      <summary><strong>Your identity backup</strong></summary>
      <p className="muted">
        Your anonymous identity is a secret stored only in this browser. If you clear site data or switch devices
        without this backup, you can no longer submit. Keep it somewhere private: anyone with it can answer as you.
      </p>
      {backup ? (
        <>
          <p className="row">
            <button onClick={() => setShown((s) => !s)}>{shown ? "Hide" : "Show"} backup</button>
            {shown && <button onClick={() => navigator.clipboard.writeText(backup)}>Copy</button>}
          </p>
          {shown && <p className="mono" data-testid="backup">{backup}</p>}
        </>
      ) : <p className="muted">No identity in this browser yet. One is created when you register.</p>}
      <label htmlFor="restore">Restore from a backup string</label>
      <input id="restore" type="text" value={restore} onChange={(e) => setRestore(e.target.value)} placeholder="nf1-…" autoComplete="off" />
      <p><button disabled={!restore.trim()} onClick={doRestore}>Restore</button></p>
      {msg && <p role="status">{msg}</p>}
    </details>
  )
}
