import { tokenize, PlaceholderParseError, type Token } from './tokenizer'
import {
  childNode, hasEval, rootNode, type PlaceholderNode, type PlaceholderParam, type PlaceholderRegistry,
} from './registry'

export interface Suggestion {
  readonly name: string
  readonly isFunction: boolean
  readonly description?: string
  readonly returns?: string
  readonly signature?: string
  readonly hint?: boolean
}

export interface SuggestionContext {
  readonly kind: 'NONE' | 'ROOT' | 'CHILD'
  readonly suggestions: readonly Suggestion[]
  readonly replaceStart: number
  readonly replaceEnd: number
}

export const NO_SUGGESTIONS: SuggestionContext = { kind: 'NONE', suggestions: [], replaceStart: -1, replaceEnd: -1 }

type FrameKind = 'PATH_PERCENT' | 'PATH_LT' | 'EXPRESSION'

interface Frame {
  kind: FrameKind
  committed: string[]
  current: string
  currentStart: number
  expectOperand: boolean
  callee?: string[]
  commas: number
}

const frame = (kind: FrameKind, currentStart: number): Frame => ({
  kind, currentStart, committed: [], current: '', expectOperand: kind === 'EXPRESSION', commas: 0,
})
const isPath = (f: Frame) => f.kind !== 'EXPRESSION'
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const matches = (candidate: string, prefix: string) => prefix === '' || candidate.toLowerCase().startsWith(prefix.toLowerCase())

function scanFrames(tokens: Token[]): Frame[] {
  const stack: Frame[] = []
  const top = () => stack[stack.length - 1] as Frame | undefined

  for (const token of tokens) {
    const t = top()
    if (token.type === 'EOF') break

    switch (token.type) {
      case 'PERCENT':
        if (stack.length === 0) stack.push(frame('PATH_PERCENT', token.end))
        else if (stack.length === 1 && t!.kind === 'PATH_PERCENT') stack.pop()
        break
      case 'LT':
        if (t && t.kind === 'EXPRESSION') {
          if (t.expectOperand) stack.push(frame('PATH_LT', token.end))
          else t.expectOperand = true
        }
        break
      case 'GT':
        if (t && t.kind === 'PATH_LT') {
          stack.pop()
          const parent = top()
          if (parent && parent.kind === 'EXPRESSION') parent.expectOperand = false
        } else if (t && t.kind === 'EXPRESSION') {
          t.expectOperand = true
        }
        break
      case 'LPAREN':
        if (stack.length > 0) {
          const opened = frame('EXPRESSION', token.end)
          if (t && isPath(t)) {
            opened.callee = [...t.committed, t.current].map((s) => s.trim()).filter((s) => s !== '')
          }
          stack.push(opened)
        }
        break
      case 'RPAREN':
        if (t && t.kind === 'EXPRESSION') {
          stack.pop()
          const parent = top()
          if (parent && parent.kind === 'EXPRESSION') parent.expectOperand = false
        }
        break
      case 'COMMA':
        if (t && t.kind === 'EXPRESSION') {
          t.expectOperand = true
          t.commas++
        }
        break
      case 'PLUS': case 'MINUS': case 'STAR': case 'SLASH': case 'ASSIGN': case 'BANG':
        if (t && t.kind === 'EXPRESSION') t.expectOperand = true
        break
      case 'DOT':
        if (t && isPath(t)) {
          t.committed.push(t.current)
          t.current = ''
          t.currentStart = token.end
        }
        break
      case 'IDENTIFIER': case 'NUMBER':
        if (t) {
          if (isPath(t)) t.current += token.text
          else t.expectOperand = false
        }
        break
      case 'STRING':
        if (t && t.kind === 'EXPRESSION') t.expectOperand = false
        break
      case 'LITERAL': case 'ESCAPED_LITERAL': case 'WHITESPACE':
        if (t && isPath(t)) t.current += token.text
        break
      default:
        break
    }
  }
  return stack
}

const HINT_TEXT = {
  index: 'Any whole number, for example 0.',
  string: 'Any name.',
  path: 'Any key path, for example key.subkey.',
} as const

const suggestionOf = (name: string, node: PlaceholderNode): Suggestion => ({
  name,
  isFunction: hasEval(node),
  description: node.description,
  returns: node.returns,
  signature: node.signature,
})

export function computeSuggestions(text: string, caret: number, registry: PlaceholderRegistry): SuggestionContext {
  if (caret < 0 || caret > text.length) return NO_SUGGESTIONS

  let stack: Frame[]
  try {
    stack = scanFrames(tokenize(text.substring(0, caret)))
  } catch (e) {
    if (e instanceof PlaceholderParseError) return NO_SUGGESTIONS
    throw e
  }

  const last = stack[stack.length - 1]
  if (!last || !isPath(last)) return NO_SUGGESTIONS

  const raw = last.current
  const prefix = raw.trim()
  const leadingWhitespace = raw.length - raw.trimStart().length
  const replaceStart = last.currentStart + leadingWhitespace

  if (last.committed.length === 0) {
    const roots = Object.keys(registry)
      .filter((name) => matches(name, prefix) && name !== prefix)
      .sort(byName)
      .map((name) => suggestionOf(name, registry[name]))
    return { kind: 'ROOT', suggestions: roots, replaceStart, replaceEnd: caret }
  }

  let node = rootNode(registry, last.committed[0].trim())
  for (let i = 1; i < last.committed.length && node; i++) node = childNode(node, last.committed[i].trim())
  if (!node) return NO_SUGGESTIONS

  const named = Object.keys(node.children ?? {})
    .filter((name) => matches(name, prefix) && name !== prefix)
    .sort(byName)
    .map((name) => suggestionOf(name, node!.children![name]))

  const hints: Suggestion[] = prefix !== '' ? [] : (node.patterns ?? []).map((pattern) => ({
    name: pattern.label,
    isFunction: false,
    hint: true,
    description: [HINT_TEXT[pattern.kind], pattern.node.description].filter(Boolean).join(' '),
    returns: pattern.node.returns,
  }))

  return { kind: 'CHILD', suggestions: [...named, ...hints], replaceStart, replaceEnd: caret }
}

export interface SignatureContext {
  readonly name: string
  readonly node: PlaceholderNode
  readonly params: readonly PlaceholderParam[]
  readonly active: number
}

export function computeSignature(text: string, caret: number, registry: PlaceholderRegistry): SignatureContext | null {
  if (caret < 0 || caret > text.length) return null

  const before = text.substring(0, caret)
  let stack: Frame[]
  try {
    stack = scanFrames(tokenize(before))
  } catch (e) {
    if (!(e instanceof PlaceholderParseError)) throw e
    stack = e.position >= 0 && e.position <= before.length ? scanFrames(tokenize(before.substring(0, e.position))) : []
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    const candidate = stack[i]
    if (candidate.kind !== 'EXPRESSION' || !candidate.callee || candidate.callee.length === 0) continue

    let node = rootNode(registry, candidate.callee[0])
    for (let k = 1; k < candidate.callee.length && node; k++) node = childNode(node, candidate.callee[k])
    if (!node || !hasEval(node)) return null

    const params = node.params ?? []
    const last = params.length - 1
    const active = params.length === 0 ? -1 : candidate.commas > last ? (params[last].variadic ? last : -1) : candidate.commas
    return { name: candidate.callee.join('.'), node, params, active }
  }
  return null
}
