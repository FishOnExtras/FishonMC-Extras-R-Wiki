import { tokenize, PlaceholderParseError, isWhitespace, type Token } from './tokenizer'
import { childNode, hasEval, hasResolver, rootNode, type PlaceholderNode, type PlaceholderRegistry } from './registry'

export type SpanKind = 'depth' | 'number' | 'string' | 'operator' | 'invalid'

export interface Span {
  readonly start: number
  readonly end: number
  readonly kind: SpanKind
  readonly depth: number
  readonly error: boolean
}

type FrameKind = 'PATH_PERCENT' | 'PATH_LT' | 'EXPRESSION'
type Use = 'MID' | 'CLOSE' | 'CALL'

interface Frame {
  kind: FrameKind
  depth: number
  expectOperand: boolean
  node: PlaceholderNode | null
  failed: boolean
  segmentStart: number
  lastSpan: number
  afterDot: boolean
}

const frame = (kind: FrameKind, depth: number, segmentStart: number): Frame => ({
  kind, depth, segmentStart, expectOperand: kind === 'EXPRESSION', node: null, failed: false, lastSpan: -1, afterDot: false,
})
const isPath = (f: Frame) => f.kind !== 'EXPRESSION'

const stripStart = (s: string) => {
  let i = 0
  while (i < s.length && isWhitespace(s[i])) i++
  return i
}

export function highlight(text: string, registry?: PlaceholderRegistry): Span[] {
  const spans: Span[] = []
  const span = (start: number, end: number, kind: SpanKind, depth = 0, error = false) =>
    spans.push({ start, end, kind, depth, error })
  const depthSpan = (token: Token, depth: number) => span(token.start, token.end, 'depth', depth)

  let tokens: Token[]
  try {
    tokens = tokenize(text)
  } catch (e) {
    if (!(e instanceof PlaceholderParseError)) throw e
    if (e.position >= 0 && e.position < text.length) {
      spans.push(...highlight(text.substring(0, e.position), registry))
      span(e.position, text.length, 'string')
    }
    return spans
  }

  const stack: Frame[] = []
  const top = () => stack[stack.length - 1] as Frame | undefined

  const resolveAndEmit = (f: Frame, resolvePos: number, use: Use) => {
    const start = f.segmentStart
    if (resolvePos <= start) return
    const raw = text.substring(start, resolvePos)
    const segment = raw.trim()
    if (segment === '') return

    const trimStart = start + stripStart(raw)
    const trimEnd = trimStart + segment.length

    if (!f.failed && registry) {
      const next = f.node === null ? rootNode(registry, segment) : childNode(f.node, segment)
      if (next === null) {
        f.failed = true
      } else {
        f.node = next
        if (use === 'CLOSE' && !hasResolver(next)) f.failed = true
        else if (use === 'CALL' && !hasEval(next)) f.failed = true
      }
    }

    f.afterDot = false
    if (f.failed) span(trimStart, trimEnd, 'invalid', f.depth, true)
    else span(trimStart, trimEnd, 'depth', f.depth)
    f.lastSpan = spans.length - 1
  }

  const checkCallable = (f: Frame) => {
    if (!registry || !f.afterDot || f.failed || f.node === null || hasEval(f.node)) return
    f.failed = true
    const previous = spans[f.lastSpan]
    if (previous) spans[f.lastSpan] = { ...previous, kind: 'invalid', error: true }
  }

  for (const token of tokens) {
    const t = top()

    switch (token.type) {
      case 'EOF':
        break
      case 'PERCENT':
        if (stack.length === 0) {
          stack.push(frame('PATH_PERCENT', 0, token.end))
          depthSpan(token, 0)
        } else if (stack.length === 1 && t!.kind === 'PATH_PERCENT') {
          stack.pop()
          resolveAndEmit(t!, token.start, 'CLOSE')
          depthSpan(token, t!.depth)
        }
        break
      case 'LT':
        if (t && t.kind === 'EXPRESSION' && t.expectOperand) {
          const depth = stack.length
          stack.push(frame('PATH_LT', depth, token.end))
          depthSpan(token, depth)
        } else if (t) {
          span(token.start, token.end, 'operator')
          if (t.kind === 'EXPRESSION') t.expectOperand = true
        }
        break
      case 'GT':
        if (t && t.kind === 'PATH_LT') {
          stack.pop()
          resolveAndEmit(t, token.start, 'CLOSE')
          depthSpan(token, t.depth)
          const parent = top()
          if (parent && parent.kind === 'EXPRESSION') parent.expectOperand = false
        } else if (t) {
          span(token.start, token.end, 'operator')
          if (t.kind === 'EXPRESSION') t.expectOperand = true
        }
        break
      case 'LPAREN':
        if (t && isPath(t)) {
          resolveAndEmit(t, token.start, 'CALL')
          checkCallable(t)
          t.afterDot = false
          const depth = stack.length
          stack.push(frame('EXPRESSION', depth, token.end))
          depthSpan(token, depth)
        } else if (t) {
          const depth = stack.length
          stack.push(frame('EXPRESSION', depth, token.end))
          depthSpan(token, depth)
        }
        break
      case 'RPAREN':
        if (t && t.kind === 'EXPRESSION') {
          stack.pop()
          depthSpan(token, t.depth)
          const parent = top()
          if (parent && parent.kind === 'EXPRESSION') parent.expectOperand = false
          else if (parent && isPath(parent)) {
            parent.segmentStart = token.end
            parent.afterDot = false
          }
        }
        break
      case 'COMMA': case 'PLUS': case 'MINUS': case 'STAR': case 'SLASH': case 'ASSIGN': case 'BANG':
        if (t && t.kind === 'EXPRESSION') {
          t.expectOperand = true
          span(token.start, token.end, 'operator')
        }
        break
      case 'NUMBER':
        if (t && t.kind === 'EXPRESSION') {
          t.expectOperand = false
          span(token.start, token.end, 'number')
        }
        break
      case 'STRING':
        if (t && t.kind === 'EXPRESSION') {
          t.expectOperand = false
          span(token.start, token.end, 'string')
        }
        break
      case 'IDENTIFIER':
        if (t && t.kind === 'EXPRESSION') t.expectOperand = false
        break
      case 'DOT':
        if (t && isPath(t)) {
          resolveAndEmit(t, token.start, 'MID')
          t.segmentStart = token.end
          t.afterDot = true
        }
        break
      default:
        break
    }
  }

  const last = top()
  if (last && isPath(last)) resolveAndEmit(last, text.length, 'MID')

  return spans
}
