import type { Proof } from "./prover.js"
import type { VerifyEvent } from "./verify.worker.js"

export function verifyAll(proofs: Proof[], onProgress: (done: number) => void): Promise<boolean[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./verify.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = ({ data }: MessageEvent<VerifyEvent>) => {
      if (data.type === "progress") return onProgress(data.done)
      worker.terminate()
      resolve(data.results)
    }
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || "verification worker failed")) }
    worker.postMessage(proofs)
  })
}
