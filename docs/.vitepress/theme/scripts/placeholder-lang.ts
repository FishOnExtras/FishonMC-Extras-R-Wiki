import { highlight } from '../components/placeholder-editor/lang/highlight'

interface FenceToken { info: string; content: string }
interface MarkdownItLike {
  renderer: {
    rules: {
      fence?: (tokens: FenceToken[], idx: number, options: unknown, env: unknown, self: unknown) => string
    }
  }
}
 
const LANGS = ['placeholder']
const DEPTHS = 10
 
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
 
export function placeholderLang(md: MarkdownItLike) {
  const defaultFence = md.renderer.rules.fence!.bind(md.renderer.rules)
 
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = token.info.trim().split(/\s+/)[0]
    if (!LANGS.includes(lang)) return defaultFence(tokens, idx, options, env, self)
 
    const raw = token.content.replace(/\n$/, '')
 
    let text = ''
    const rawIndex: number[] = []
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '\n' || raw[i] === '\r') continue
      text += raw[i]
      rawIndex.push(i)
    }
 
    const spans = highlight(text).slice().sort((a, b) => a.start - b.start || a.end - b.end)
 
    const runs: [number, number, string | null][] = []
    let cursor = 0
    for (const span of spans) {
      if (span.end <= span.start) continue
      const rawStart = rawIndex[span.start]
      const rawEnd = rawIndex[span.end - 1] + 1
      if (rawStart < cursor) continue
      if (rawStart > cursor) runs.push([cursor, rawStart, null])
      const cls = span.error || span.kind === 'invalid' ? 'pl-invalid'
        : span.kind === 'depth' ? `pl-depth${span.depth % DEPTHS}`
        : `pl-${span.kind}`
      runs.push([rawStart, rawEnd, cls])
      cursor = rawEnd
    }
    if (cursor < raw.length) runs.push([cursor, raw.length, null])
 
    const lines = raw.split('\n')
    const lineOffsets: number[] = []
    { let o = 0; for (const l of lines) { lineOffsets.push(o); o += l.length + 1 } }
 
    const html = lines.map((line: string, i: number) => {
      const lineStart = lineOffsets[i]
      const lineEnd = lineStart + line.length
      let out = ''
      for (const [start, end, cls] of runs) {
        const s = Math.max(start, lineStart)
        const e = Math.min(end, lineEnd)
        if (e <= s) continue
        const chunk = escapeHtml(raw.slice(s, e))
        out += cls ? `<span class="${cls}">${chunk}</span>` : chunk
      }
      return `<span class="line">${out}</span>`
    }).join('\n')
 
    return `<div class="language-${lang}">`
      + `<button title="Copy Code" class="copy"></button>`
      + `<span class="lang">${lang}</span>`
      + `<pre class="shiki placeholder-lang" tabindex="0"><code>${html}</code></pre>`
      + `</div>\n`
  }
}