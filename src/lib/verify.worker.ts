import { verifyProof } from "@semaphore-protocol/proof"
import type { Proof } from "./prover.js"

export type VerifyEvent = { type: "progress"; done: number } | { type: "done"; results: boolean[] }

/** Verifies each Groth16 proof off the main thread, reporting progress as it goes. */
self.onmessage = async ({ data }: MessageEvent<Proof[]>) => {
  const results: boolean[] = []
  for (const [i, proof] of data.entries()) {
    try { results.push(await verifyProof(proof)) } catch { results.push(false) }
    if ((i + 1) % 10 === 0) self.postMessage({ type: "progress", done: i + 1 } satisfies VerifyEvent)
  }
  self.postMessage({ type: "done", results } satisfies VerifyEvent)
}
