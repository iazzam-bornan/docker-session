// ─────────────────────────────────────────────────────────────────────────
// search via wikipedia
//
// we tried scraping duckduckgo's html endpoint first; ddg cloudflare-walls
// any non-residential IP within minutes, so it's not viable for a server
// running in a lab. wikipedia's opensearch api is:
//
//   • free
//   • no api key
//   • no rate limit worth worrying about for a 15-person demo
//   • returns results perfectly suited to a technical audience
//   • well-handled by our own reader-mode renderer
//
// shape: GET /api/search?q=docker
// returns: { query, results: [{ title, url, snippet, displayUrl }, ...] }
// ─────────────────────────────────────────────────────────────────────────

const WIKIPEDIA_OPENSEARCH =
  "https://en.wikipedia.org/w/api.php?" +
  "action=opensearch&format=json&namespace=0&limit=12&profile=fuzzy&search="

const WIKIPEDIA_USER_AGENT =
  "dockerlab/0.1 (educational demo; +https://github.com/dockerlab)"

export type SearchResult = {
  title: string
  url: string
  snippet: string
  displayUrl: string
}

export type SearchResponse = {
  query: string
  results: SearchResult[]
}

/**
 * The OpenSearch v1 response is a positional tuple:
 *   [ "the search term",
 *     [ "Title 1", "Title 2", ... ],
 *     [ "snippet 1", "snippet 2", ... ],
 *     [ "https://en.wikipedia.org/wiki/Title_1", ... ]
 *   ]
 */
type OpenSearchTuple = [string, string[], string[], string[]]

export async function handleSearch(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim()
  if (!q) {
    return Response.json({ query: "", results: [] } satisfies SearchResponse)
  }

  let upstream: Response
  try {
    upstream = await fetch(WIKIPEDIA_OPENSEARCH + encodeURIComponent(q), {
      headers: {
        // Wikipedia asks every script to identify itself; otherwise they
        // throttle / 403. They explicitly recommend tool name + contact.
        "user-agent": WIKIPEDIA_USER_AGENT,
        accept: "application/json",
        "accept-language": "en",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: `wikipedia upstream failed: ${message}` },
      { status: 502 }
    )
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `wikipedia upstream returned ${upstream.status}` },
      { status: 502 }
    )
  }

  let tuple: OpenSearchTuple
  try {
    tuple = (await upstream.json()) as OpenSearchTuple
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: `wikipedia returned malformed json: ${message}` },
      { status: 502 }
    )
  }

  const titles = Array.isArray(tuple[1]) ? tuple[1] : []
  const snippets = Array.isArray(tuple[2]) ? tuple[2] : []
  const urls = Array.isArray(tuple[3]) ? tuple[3] : []

  const results: SearchResult[] = []
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i]
    const targetUrl = urls[i]
    if (!title || !targetUrl) continue
    results.push({
      title,
      url: targetUrl,
      snippet: snippets[i] ?? "",
      displayUrl: displayHostFor(targetUrl),
    })
  }

  return Response.json({ query: q, results } satisfies SearchResponse)
}

function displayHostFor(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host.replace(/^www\./, "")}${u.pathname}`.replace(/\/$/, "")
  } catch {
    return url
  }
}
