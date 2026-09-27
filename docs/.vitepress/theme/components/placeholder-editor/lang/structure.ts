import { tokenize, PlaceholderParseError, type Token } from './tokenizer'

export type FrameKind = 'NONE' | 'BLOCK' | 'PATH_LT' | 'CALL' | 'GROUP'

export interface Delimiter {
  readonly index: number
  readonly char: string
  readonly partner: number
}

export interface CaretContext {
  readonly frame: FrameKind
  readonly expectOperand: boolean
  readonly inString: boolean
}

export const isExpression = (frame: FrameKind): boolean => frame === 'CALL' || frame === 'GROUP'

export interface Structure {
  delimiterAt(index: number): Delimiter | undefined
  readonly unmatched: readonly Delimiter[]
}

interface MutableDelimiter { index: number; char: string; partner: number }

interface Frame {
  kind: Exclude<FrameKind, 'NONE'>
  open: MutableDelimiter
  expectOperand: boolean
}

const isPath = (frame: Frame) => frame.kind === 'BLOCK' || frame.kind === 'PATH_LT'
const isExpr = (frame: Frame) => frame.kind === 'CALL' || frame.kind === 'GROUP'

function scan(tokens: Token[]) {
  const delimiters = new Map<number, MutableDelimiter>()
  const stack: Frame[] = []

  const delimiter = (token: Token, char: string) => {
    const created = { index: token.start, char, partner: -1 }
    delimiters.set(created.index, created)
    return created
  }
  const push = (kind: Frame['kind'], token: Token, char: string) =>
    stack.push({ kind, open: delimiter(token, char), expectOperand: kind === 'CALL' || kind === 'GROUP' })
  const close = (token: Token, char: string) => {
    const frame = stack.pop()!
    const closer = delimiter(token, char)
    closer.partner = frame.open.index
    frame.open.partner = closer.index
  }
  const top = () => stack[stack.length - 1] as Frame | undefined

  for (const token of tokens) {
    const t = top()

    switch (token.type) {
      case 'EOF':
        return { delimiters, stack }
      case 'PERCENT':
        if (stack.length === 0) push('BLOCK', token, '%')
        else if (stack.length === 1 && t!.kind === 'BLOCK') close(token, '%')
        break
      case 'LT':
        if (t && isExpr(t)) {
          if (t.expectOperand) push('PATH_LT', token, '<')
          else t.expectOperand = true
        }
        break
      case 'GT':
        if (t && t.kind === 'PATH_LT') {
          close(token, '>')
          const parent = top()
          if (parent && isExpr(parent)) parent.expectOperand = false
        } else if (t && isExpr(t)) {
          t.expectOperand = true
        }
        break
      case 'LPAREN':
        if (t) push(isPath(t) ? 'CALL' : 'GROUP', token, '(')
        break
      case 'RPAREN':
        if (t) {
          if (isExpr(t)) {
            close(token, ')')
            const parent = top()
            if (parent && isExpr(parent)) parent.expectOperand = false
          } else {
            delimiter(token, ')')
          }
        }
        break
      case 'COMMA': case 'PLUS': case 'MINUS': case 'STAR': case 'SLASH': case 'ASSIGN': case 'BANG':
        if (t && isExpr(t)) t.expectOperand = true
        break
      case 'NUMBER': case 'STRING': case 'IDENTIFIER':
        if (t && isExpr(t)) t.expectOperand = false
        break
      default:
        break
    }
  }
  return { delimiters, stack }
}

const EMPTY: Structure = { delimiterAt: () => undefined, unmatched: [] }

export function analyze(text: string): Structure {
  let scanned: ReturnType<typeof scan>
  try {
    scanned = scan(tokenize(text))
  } catch (e) {
    if (!(e instanceof PlaceholderParseError)) throw e
    if (e.position < 0 || e.position > text.length) return EMPTY
    scanned = scan(tokenize(text.substring(0, e.position)))
  }

  const delimiters = new Map<number, Delimiter>()
  for (const d of scanned.delimiters.values()) delimiters.set(d.index, { ...d })
  const unmatched = [...delimiters.values()].filter((d) => d.partner < 0)
  return { delimiterAt: (index) => delimiters.get(index), unmatched }
}

const contextOf = (stack: Frame[], inString: boolean): CaretContext => {
  const top = stack[stack.length - 1]
  return top ? { frame: top.kind, expectOperand: isExpr(top) && top.expectOperand, inString } : { frame: 'NONE', expectOperand: false, inString }
}

export function contextAt(text: string, caret: number): CaretContext {
  if (caret < 0 || caret > text.length) return { frame: 'NONE', expectOperand: false, inString: false }

  const before = text.substring(0, caret)
  try {
    return contextOf(scan(tokenize(before)).stack, false)
  } catch (e) {
    if (!(e instanceof PlaceholderParseError)) throw e
    if (e.position < 0 || e.position > before.length) return { frame: 'NONE', expectOperand: false, inString: true }
    return contextOf(scan(tokenize(before.substring(0, e.position))).stack, true)
  }
}
