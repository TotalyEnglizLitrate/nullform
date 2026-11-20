import { defineConfig, loadEnv, type Plugin } from "vite"

/** Dev only: serves /api/* by calling the same handlers Vercel runs in production. */
function apiDev(): Plugin {
  return {
    name: "api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = /^\/api\/(register|submit|lifecycle)$/.exec((req.url ?? "").split("?")[0]!)
        if (!route) return next()
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const hasBody = req.method !== "GET" && req.method !== "HEAD"
        const request = new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: hasBody ? Buffer.concat(chunks) : undefined,
        })
        const mod = await server.ssrLoadModule(`/api/${route[1]}.ts`)
        const response: Response = await mod.POST(request)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), "")) // server-side vars for the dev API
  return {
    plugins: [apiDev()],
    oxc: { jsx: { runtime: "automatic" } },
    worker: { format: "es" },
    build: { target: "es2022" },
  }
})
