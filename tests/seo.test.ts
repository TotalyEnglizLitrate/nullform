import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
const html = read("index.html")
const robots = read("public/robots.txt")
const sitemap = read("public/sitemap.xml")
const vercel = JSON.parse(read("vercel.json")) as { headers: { source: string; headers: { key: string; value: string }[] }[] }

const attr = (tag: RegExp, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag.exec(html)?.[0] ?? "")?.[1]
const canonical = attr(/<link rel="canonical"[^>]*>/, "href")!
const description = attr(/<meta name="description"[^>]*>/, "content")!

describe("search engine basics", () => {
  it("has a descriptive title that includes the brand", () => {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]
    expect(title).toBe("NullForm: Authenticated, Anonymous forms")
    expect(title!.length).toBeLessThanOrEqual(60) // longer titles get cut off in results
  })

  it("has a description of a sensible length", () => {
    expect(description.length).toBeGreaterThanOrEqual(50)
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it("declares one absolute canonical URL, which is the homepage", () => {
    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1)
    expect(canonical).toMatch(/^https:\/\/[^/]+\/$/)
  })

  it("keeps the link-preview title exactly as requested", () => {
    expect(attr(/<meta property="og:title"[^>]*>/, "content")).toBe("Authenticated, Anonymous forms")
  })

  it("declares a language and a viewport", () => {
    expect(html).toMatch(/<html lang="en">/)
    expect(html).toMatch(/<meta name="viewport"/)
  })

  it("has structured data that parses and points at the canonical URL", () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1]
    expect(block).toBeTruthy()
    const data = JSON.parse(block!)
    expect(data["@context"]).toBe("https://schema.org")
    expect(data["@type"]).toBe("WebApplication")
    expect(data.name).toBe("NullForm")
    expect(data.url).toBe(canonical)
  })

  it("keeps readable content in the raw HTML for crawlers that don't run scripts", () => {
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? ""
    expect(noscript).toMatch(/<h1>Authenticated, Anonymous forms<\/h1>/)
    expect(noscript).toMatch(/Only the answers are anonymous; registering is not/)
  })
})

describe("robots.txt", () => {
  it("lets crawlers in, keeps them out of the API and circuit files, and names the sitemap", () => {
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Disallow: \/api\/$/m)
    expect(robots).toMatch(/^Disallow: \/artifacts\/$/m)
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m) // never blocks the whole site
    const origin = new URL(canonical).origin
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`)
  })
})

describe("sitemap.xml", () => {
  it("is a valid sitemap listing exactly the canonical homepage", () => {
    expect(sitemap).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual([canonical])
  })

  it("never lists fragment URLs, which search engines treat as the homepage", () => {
    expect(sitemap).not.toMatch(/<loc>[^<]*#/)
  })
})

describe("headers", () => {
  const rule = (source: string) => vercel.headers.find((h) => h.source === source)?.headers ?? []
  const hasKey = (source: string, key: string) => rule(source).some((h) => h.key === key)

  it("marks the API and the circuit files noindex, and never the pages", () => {
    expect(rule("/api/(.*)").find((h) => h.key === "X-Robots-Tag")?.value).toBe("noindex")
    expect(rule("/artifacts/(.*)").find((h) => h.key === "X-Robots-Tag")?.value).toBe("noindex")
    expect(hasKey("/(.*)", "X-Robots-Tag")).toBe(false)
  })
})
