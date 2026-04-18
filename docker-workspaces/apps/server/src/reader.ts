// ─────────────────────────────────────────────────────────────────────────
// reader mode
//
// fetches a url server-side and extracts the article content as a small
// JSON payload that the frontend renders in our own typography.
//
// extraction strategy (in order of preference):
//   1. <article>
//   2. <main>
//   3. element with role="main"
//   4. fallback: just the body, with nav/aside/footer/script/style stripped
//
// elements we always strip from the result:
//   • <script>, <style>, <noscript>, <iframe>, <object>, <embed>, <svg>
//   • <nav>, <header>, <footer>, <aside>, <form>
//   • elements with role="navigation"
//   • images (kept) but with rewritten src to absolute URLs
//
// this is intentionally not as smart as @mozilla/readability — we don't
// need it for the demo. wikipedia, mdn, blog posts, news articles all use
// semantic HTML and the simple <article>/<main> rule covers them.
// ─────────────────────────────────────────────────────────────────────────

const FAKE_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// Reader returns a discriminated union so the frontend can pick the right
// renderer per content type. Adding a new type means: detect it in
// handleReader, return a new variant, render it on the frontend.
export type ReaderResponse =
  | {
      kind: "html"
      url: string
      title: string
      byline: string | null
      siteName: string | null
      excerpt: string | null
      content: string // sanitized HTML
    }
  | {
      kind: "image"
      url: string
      title: string
      contentType: string
      byteSize: number | null
    }
  | {
      kind: "pdf"
      url: string
      title: string
      byteSize: number | null
    }
  | {
      kind: "text"
      url: string
      title: string
      contentType: string
      content: string
      truncated: boolean
    }
  | {
      kind: "binary"
      url: string
      contentType: string
      byteSize: number | null
    }
  | {
      kind: "error"
      url: string
      error: string
    }

const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "video",
  "audio",
])

const ALLOWED_TAGS = new Set([
  "a",
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "em",
  "strong",
  "b",
  "i",
  "u",
  "mark",
  "small",
  "sub",
  "sup",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "hr",
  "div",
  "span",
  "section",
  "article",
])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
}

/**
 * Tag-by-tag sanitizer. We tokenize the input HTML on `<...>` boundaries,
 * decide whether each tag is allowed, and rewrite attributes if it is. Text
 * between tags is left untouched.
 *
 * This isn't a real HTML parser — it gets confused by `<` inside attribute
 * values, by malformed nested tags, etc. — but for the demo it's enough.
 * The frontend renders the result with `dangerouslySetInnerHTML`, which is
 * fine *only because* we drop all script/event-handler attributes here.
 */
function sanitize(html: string, base: URL): string {
  let dropDepth = 0 // when > 0, we're inside a banned tag and must drop everything
  let dropTagStack: string[] = [] // stack of tags we're currently dropping

  let out = ""
  let cursor = 0

  while (cursor < html.length) {
    const lt = html.indexOf("<", cursor)
    if (lt === -1) {
      if (dropDepth === 0) out += html.slice(cursor)
      break
    }
    if (dropDepth === 0 && lt > cursor) {
      out += html.slice(cursor, lt)
    }
    const gt = html.indexOf(">", lt)
    if (gt === -1) break

    const tagText = html.slice(lt, gt + 1)
    cursor = gt + 1

    // skip comments / DOCTYPE / CDATA
    if (tagText.startsWith("<!")) continue
    if (tagText.startsWith("<?")) continue

    const isClose = tagText.startsWith("</")
    const tagBody = tagText.slice(isClose ? 2 : 1, -1).trim()
    const nameMatch = tagBody.match(/^([a-zA-Z][a-zA-Z0-9-]*)/)
    if (!nameMatch) continue
    const tagName = nameMatch[1].toLowerCase()
    const isSelfClosing = /\/\s*$/.test(tagBody)

    // currently dropping?
    if (dropDepth > 0) {
      if (isClose && dropTagStack[dropTagStack.length - 1] === tagName) {
        dropTagStack.pop()
        dropDepth--
      } else if (!isClose && !isSelfClosing && DROP_TAGS.has(tagName)) {
        dropTagStack.push(tagName)
        dropDepth++
      }
      continue
    }

    if (DROP_TAGS.has(tagName)) {
      if (!isClose && !isSelfClosing) {
        dropTagStack.push(tagName)
        dropDepth++
      }
      continue
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      // unknown tag — skip the tag itself but keep its contents
      continue
    }

    if (isClose) {
      out += `</${tagName}>`
      continue
    }

    // build a clean opening tag with only the allowed attributes
    const attrs = parseAttributes(tagBody)
    const allowedAttrs = ALLOWED_ATTRS[tagName] ?? new Set<string>()
    const cleanAttrs: string[] = []
    for (const [key, value] of attrs) {
      if (key.startsWith("on")) continue // strip every event handler
      if (!allowedAttrs.has(key)) continue
      let v = value
      if (key === "href" || key === "src") {
        try {
          v = new URL(v, base).href
        } catch {
          continue
        }
        if (!v.startsWith("http://") && !v.startsWith("https://")) continue
      }
      cleanAttrs.push(`${key}="${escapeAttr(v)}"`)
    }
    const attrStr = cleanAttrs.length ? " " + cleanAttrs.join(" ") : ""
    out += `<${tagName}${attrStr}${isSelfClosing ? " /" : ""}>`
  }

  return out
}

function parseAttributes(tagBody: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  // skip the tag name
  const afterName = tagBody.replace(/^[a-zA-Z][a-zA-Z0-9-]*\s*/, "")
  const re =
    /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(afterName)) !== null) {
    const name = m[1].toLowerCase()
    const value = m[3] ?? m[4] ?? m[5] ?? ""
    out.push([name, value])
  }
  return out
}

function escapeAttr(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── element extraction with depth counting ──────────────────────────────
//
// the previous version used `<tag>([\s\S]*?)</tag>` which fails on every
// page that nests tags of the same name (i.e. every page). wikipedia has
// hundreds of nested <div>s inside its mw-parser-output container, so the
// non-greedy match would stop at the very first </div> and return ~nothing.
//
// the version below finds the opening tag, then walks forward through all
// tag openings/closings of the same name, tracking depth, until depth
// returns to zero. that's the actual matching closing tag.

type Selector = {
  tag: string
  /** match elements whose `id` attribute equals this value */
  id?: string
  /** match elements whose `role` attribute equals this value */
  role?: string
  /** match elements whose `class` attribute *contains* this token */
  classContains?: string
}

function buildOpenPattern(s: Selector): RegExp {
  // we only support one constraint per selector — the rules below cover
  // every case our priority list needs.
  if (s.id) {
    return new RegExp(
      `<${s.tag}\\b[^>]*\\bid\\s*=\\s*["']${s.id}["'][^>]*>`,
      "i"
    )
  }
  if (s.role) {
    return new RegExp(
      `<${s.tag}\\b[^>]*\\brole\\s*=\\s*["']${s.role}["'][^>]*>`,
      "i"
    )
  }
  if (s.classContains) {
    return new RegExp(
      `<${s.tag}\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${s.classContains}\\b[^"']*["'][^>]*>`,
      "i"
    )
  }
  return new RegExp(`<${s.tag}\\b[^>]*>`, "i")
}

function extractElement(html: string, selector: Selector): string | null {
  const openPattern = buildOpenPattern(selector)
  const openMatch = openPattern.exec(html)
  if (!openMatch) return null
  // self-closing — no content to extract
  if (openMatch[0].endsWith("/>")) return null

  const contentStart = openMatch.index + openMatch[0].length

  // walk every <tag> and </tag> after the opening, tracking depth
  const tagRe = new RegExp(`<(/?)${selector.tag}\\b[^>]*>`, "gi")
  tagRe.lastIndex = contentStart

  let depth = 1
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html)) !== null) {
    const isClose = m[1] === "/"
    if (isClose) {
      depth--
      if (depth === 0) {
        return html.substring(contentStart, m.index)
      }
    } else if (!m[0].endsWith("/>")) {
      depth++
    }
  }
  // unbalanced — give up rather than return a malformed slice
  return null
}

function extractFirst(html: string, selectors: Selector[]): string | null {
  for (const selector of selectors) {
    const content = extractElement(html, selector)
    if (content && content.trim()) return content
  }
  return null
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? stripTags(m[1]) : "untitled"
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]*(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    "i"
  )
  const m = html.match(re)
  if (m) return decodeEntities(m[1])
  // try with content first
  const re2 = new RegExp(
    `<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${name}["']`,
    "i"
  )
  const m2 = html.match(re2)
  return m2 ? decodeEntities(m2[1]) : null
}

function decodeEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
}

// Cap on text bodies we'll buffer in memory. JSON, text, and HTML beyond
// this get truncated rather than letting a malicious server flood the demo.
const MAX_TEXT_BYTES = 2 * 1024 * 1024 // 2 MB

function titleFromUrl(target: URL): string {
  // Last path segment is the most informative fallback for non-HTML resources.
  const last = target.pathname.split("/").filter(Boolean).pop()
  if (last) {
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  }
  return target.host
}

function errorResponse(
  url: string,
  error: string,
  status: number
): Response {
  return Response.json(
    { kind: "error", url, error } satisfies ReaderResponse,
    { status }
  )
}

export async function handleReader(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const target = url.searchParams.get("url")
  if (!target) return errorResponse("", "missing ?url= parameter", 400)

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return errorResponse(target, "invalid url", 400)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return errorResponse(target, "only http(s) urls are allowed", 400)
  }

  // SSRF guard — same logic as before. Loopback allowed in dev so the demo
  // can hit user containers on the same host; RFC1918 always blocked.
  const allowLoopback =
    (process.env.DOCKERLAB_ALLOW_LOOPBACK ?? "true").toLowerCase() !== "false"
  const host = parsed.hostname.toLowerCase()
  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1"
  const isPrivate =
    host.startsWith("169.254.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if ((isLoopback && !allowLoopback) || isPrivate) {
    return errorResponse(
      target,
      "private addresses are not allowed through reader",
      403
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(parsed, {
      headers: {
        "user-agent": FAKE_USER_AGENT,
        // Don't lock to text/html — we want to handle whatever comes back.
        accept:
          "text/html,application/xhtml+xml,image/*,application/pdf,application/json,text/*;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return errorResponse(target, `fetch failed: ${message}`, 502)
  }

  if (!upstream.ok) {
    return errorResponse(
      target,
      `upstream returned ${upstream.status} ${upstream.statusText}`,
      502
    )
  }

  const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase()
  const lengthHeader = upstream.headers.get("content-length")
  const byteSize = lengthHeader ? Number(lengthHeader) : null

  // ─── images: render in <img>, no body needed ─────────────────────────
  if (contentType.startsWith("image/")) {
    return Response.json({
      kind: "image",
      url: parsed.href,
      title: titleFromUrl(parsed),
      contentType,
      byteSize,
    } satisfies ReaderResponse)
  }

  // ─── pdf: tell the frontend to use the proxied URL in an <embed> ─────
  if (contentType.includes("application/pdf")) {
    return Response.json({
      kind: "pdf",
      url: parsed.href,
      title: titleFromUrl(parsed),
      byteSize,
    } satisfies ReaderResponse)
  }

  // ─── plain text / json / xml / svg / yaml / etc ──────────────────────
  // We use `includes` instead of equality because real responses always
  // have a charset suffix like `application/json; charset=utf-8` — exact
  // string equality misses every one of them.
  const isText =
    contentType.startsWith("text/") ||
    contentType.includes("application/json") ||
    contentType.includes("application/xml") ||
    contentType.includes("application/javascript") ||
    contentType.includes("application/ld+json") ||
    contentType.includes("application/x-yaml") ||
    contentType.includes("image/svg+xml")

  if (isText && !contentType.includes("text/html")) {
    const buf = await upstream.arrayBuffer()
    let truncated = false
    let bytes = new Uint8Array(buf)
    if (bytes.byteLength > MAX_TEXT_BYTES) {
      bytes = bytes.subarray(0, MAX_TEXT_BYTES)
      truncated = true
    }
    const decoder = new TextDecoder("utf-8", { fatal: false })
    const text = decoder.decode(bytes)
    return Response.json({
      kind: "text",
      url: parsed.href,
      title: titleFromUrl(parsed),
      contentType,
      content: text,
      truncated,
    } satisfies ReaderResponse)
  }

  // ─── html — full reader extraction ───────────────────────────────────
  if (contentType.includes("text/html")) {
    let html = await upstream.text()
    if (html.length > MAX_TEXT_BYTES) html = html.slice(0, MAX_TEXT_BYTES)

    const title =
      extractMeta(html, "og:title") ??
      extractMeta(html, "twitter:title") ??
      extractTitle(html)
    const byline =
      extractMeta(html, "author") ??
      extractMeta(html, "article:author") ??
      null
    const siteName = extractMeta(html, "og:site_name") ?? parsed.host
    const excerpt =
      extractMeta(html, "description") ??
      extractMeta(html, "og:description") ??
      null

    // strip <!-- comments --> first because they can break our regex matches
    const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, "")

    const rawContent =
      extractFirst(cleanHtml, [
        // wikipedia article body — most specific, try first
        { tag: "div", classContains: "mw-parser-output" },
        { tag: "article" },
        { tag: "main" },
        { tag: "div", role: "main" },
        // wikipedia outer content (fallback if mw-parser-output isn't present)
        { tag: "div", id: "mw-content-text" },
        { tag: "div", id: "content" },
        { tag: "div", id: "main-content" },
      ]) ??
      extractFirst(cleanHtml, [{ tag: "body" }]) ??
      ""

    const sanitized = sanitize(rawContent, parsed)

    return Response.json({
      kind: "html",
      url: parsed.href,
      title,
      byline,
      siteName,
      excerpt,
      content: sanitized,
    } satisfies ReaderResponse)
  }

  // ─── unknown binary — let the frontend offer a download button ───────
  return Response.json({
    kind: "binary",
    url: parsed.href,
    contentType: contentType || "unknown",
    byteSize,
  } satisfies ReaderResponse)
}
