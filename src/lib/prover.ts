import type { Identity } from "@semaphore-protocol/identity"
import type { ProveEvent, ProveRequest } from "./prove.worker.js"

export type Proof = Extract<ProveEvent, { type: "done" }>["proof"]

/** Generates a Semaphore proof in a Web Worker so the page stays responsive. */
export function prove(
  identity: Identity,
  req: Omit<ProveRequest, "identity">,
  onStep: (step: "group" | "proof") => void,
): Promise<Proof> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./prove.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = ({ data }: MessageEvent<ProveEvent>) => {
      if (data.type === "progress") return onStep(data.step)
      worker.terminate()
      if (data.type === "done") resolve(data.proof)
      else reject(new Error(data.message))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || "proof worker failed"))
    }
    worker.postMessage({ ...req, identity: identity.export() } satisfies ProveRequest)
  })
}
