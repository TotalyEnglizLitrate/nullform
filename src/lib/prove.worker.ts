import { Group } from "@semaphore-protocol/group"
import { Identity } from "@semaphore-protocol/identity"
import { generateProof } from "@semaphore-protocol/proof"
import { sortLeaves } from "../../shared/leaves.js"

export interface ProveRequest {
  identity: string // Identity.export()
  leaves: string[]
  message: string
  scope: string
  depth: number
}
export type ProveEvent =
  | { type: "progress"; step: "group" | "proof" }
  | { type: "done"; proof: Awaited<ReturnType<typeof generateProof>> }
  | { type: "error"; message: string }

const post = (e: ProveEvent) => self.postMessage(e)

self.onmessage = async ({ data }: MessageEvent<ProveRequest>) => {
  try {
    post({ type: "progress", step: "group" })
    const group = new Group(sortLeaves(data.leaves))
    post({ type: "progress", step: "proof" })
    // Circuit artifacts are self-hosted: same origin, pinned by the build.
    const artifacts = {
      wasm: `${self.location.origin}/artifacts/semaphore-${data.depth}.wasm`,
      zkey: `${self.location.origin}/artifacts/semaphore-${data.depth}.zkey`,
    }
    const proof = await generateProof(Identity.import(data.identity), group, data.message, data.scope, data.depth, artifacts)
    post({ type: "done", proof })
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) })
  }
}
