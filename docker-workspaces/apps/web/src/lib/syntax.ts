// ─────────────────────────────────────────────────────────────────────────
// shared syntax helpers used by the files app (file-type icons) and the
// code app (line-by-line tokenizer for the editor).
//
// the tokenizer is intentionally tiny — it only does enough to make
// keywords, strings, numbers, and comments stand out. it is NOT a parser.
// ─────────────────────────────────────────────────────────────────────────

export type Token = { text: string; cls?: string }

export function languageFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower === "dockerfile" || lower.endsWith(".dockerfile")) return "dockerfile"
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "javascript"
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript"
  if (lower.endsWith(".json")) return "json"
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml"
  if (lower.endsWith(".md")) return "markdown"
  if (lower.startsWith(".dockerignore") || lower.endsWith(".env")) return "ini"
  return "plaintext"
}

const KEYWORDS: Record<string, RegExp> = {
  javascript:
    /\b(import|from|const|let|var|function|return|export|default|if|else|new|async|await|process|true|false|null|undefined)\b/g,
  typescript:
    /\b(import|from|const|let|var|function|return|export|default|if|else|new|async|await|process|true|false|null|undefined|type|interface|as|satisfies)\b/g,
  json: /\b(true|false|null)\b/g,
  yaml: /^\s*[\w.-]+(?=:)/gm,
  dockerfile:
    /\b(FROM|AS|WORKDIR|COPY|RUN|ENV|EXPOSE|CMD|ENTRYPOINT|ARG|LABEL|USER|VOLUME)\b/g,
  markdown: /^(#{1,6})\s.*$/gm,
  ini: /$^/,
  plaintext: /$^/,
}

const STRINGS = /(["'`])(?:\\.|(?!\1)[^\\])*\1/g
const COMMENTS_HASH = /#.*$/gm
const COMMENTS_SLASH = /\/\/.*$/gm
const NUMBERS = /\b\d+\b/g

export function tokenize(content: string, language: string): Token[][] {
  const lines = content.split("\n")

  return lines.map((line) => {
    const tokens: Token[] = []
    let cursor = 0

    type Match = { start: number; end: number; cls: string }
    const matches: Match[] = []

    const addAll = (re: RegExp, cls: string) => {
      const r = new RegExp(re.source, re.flags.replace("g", "") + "g")
      let m
      while ((m = r.exec(line)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, cls })
        if (m.index === r.lastIndex) r.lastIndex++
      }
    }

    addAll(STRINGS, "text-amber-300/80")
    if (
      language === "javascript" ||
      language === "typescript" ||
      language === "json"
    ) {
      addAll(COMMENTS_SLASH, "text-foreground/30 italic")
    }
    if (
      language === "yaml" ||
      language === "dockerfile" ||
      language === "ini" ||
      language === "plaintext"
    ) {
      addAll(COMMENTS_HASH, "text-foreground/30 italic")
    }
    addAll(NUMBERS, "text-violet-300/85")
    if (KEYWORDS[language]) {
      addAll(KEYWORDS[language], "text-sky-300 font-medium")
    }

    matches.sort((a, b) => a.start - b.start)
    const cleaned: Match[] = []
    for (const m of matches) {
      if (cleaned.length && m.start < cleaned[cleaned.length - 1].end) continue
      cleaned.push(m)
    }

    for (const m of cleaned) {
      if (m.start > cursor) {
        tokens.push({ text: line.slice(cursor, m.start) })
      }
      tokens.push({ text: line.slice(m.start, m.end), cls: m.cls })
      cursor = m.end
    }
    if (cursor < line.length) tokens.push({ text: line.slice(cursor) })
    if (tokens.length === 0) tokens.push({ text: "" })
    return tokens
  })
}
