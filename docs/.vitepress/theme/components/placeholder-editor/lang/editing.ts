import { contextAt, isExpression } from './structure'
import { stripNewlines } from './text'
import { isWhitespace } from './tokenizer'

export interface EditState {
  text: string
  start: number
  end: number
}

export const INDENT = '  '

const caretState = (text: string, caret: number): EditState => ({ text, start: caret, end: caret })

function contextIn(state: EditState, caret: number) {
  const stripped = stripNewlines(state.text)
  return contextAt(stripped.text, stripped.toStripped(caret))
}

function leadingWhitespace(text: string, caret: number): string {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1
  let i = lineStart
  while (i < caret && (text[i] === ' ' || text[i] === '\t')) i++
  return text.substring(lineStart, i)
}

export function typeChar(state: EditState, typed: string): EditState | null {
  const opener = typed === '(' || typed === '<' || typed === '"'
  const closer = typed === ')' || typed === '>' || typed === '"'
  if ((!opener && !closer) || state.start !== state.end) return null

  const { text } = state
  const caret = state.start
  const ctx = contextIn(state, caret)
  const before = caret > 0 ? text[caret - 1] : '\0'
  const after = caret < text.length ? text[caret] : '\0'

  if (closer && after === typed) {
    const skip = typed === ')' ? !ctx.inString && isExpression(ctx.frame)
      : typed === '>' ? !ctx.inString && ctx.frame === 'PATH_LT'
      : ctx.inString && isExpression(ctx.frame) && before !== '\\'
    if (skip) return caretState(text, caret + 1)
  }

  if (opener && !ctx.inString) {
    const pair = typed === '(' ? ctx.frame !== 'NONE'
      : typed === '<' ? isExpression(ctx.frame) && ctx.expectOperand
      : isExpression(ctx.frame) && ctx.expectOperand && before !== '\\'
    const boundary = after === '\0' || isWhitespace(after) || ')>,%"'.includes(after)
    if (pair && boundary) {
      const closing = typed === '(' ? ')' : typed === '<' ? '>' : '"'
      return caretState(text.slice(0, caret) + typed + closing + text.slice(caret), caret + 1)
    }
  }

  return null
}

export function backspace(state: EditState): EditState | null {
  if (state.start !== state.end || state.start <= 0 || state.start >= state.text.length) return null

  const { text } = state
  const caret = state.start
  const pair = text[caret - 1] + text[caret]
  if (pair !== '()' && pair !== '<>' && pair !== '""') return null
  if (contextIn(state, caret).frame === 'NONE') return null

  return caretState(text.slice(0, caret - 1) + text.slice(caret + 1), caret - 1)
}

export function enter(state: EditState): EditState {
  const { text } = state
  const caret = state.start
  const indent = leadingWhitespace(text, caret)
  const replace = (inserted: string, caretInInserted = inserted.length): EditState =>
    caretState(text.slice(0, caret) + inserted + text.slice(state.end), caret + caretInInserted)

  if (state.start === state.end && caret > 0) {
    const ctx = contextIn(state, caret)
    const before = text[caret - 1]
    const after = caret < text.length ? text[caret] : '\0'

    const afterParen = before === '(' && isExpression(ctx.frame)
    const afterBlockStart = before === '%' && ctx.frame === 'BLOCK'
    if (!ctx.inString && (afterParen || afterBlockStart)) {
      const inner = '\n' + indent + INDENT
      const closerFollows = afterParen ? after === ')' : after === '%'
      return closerFollows ? replace(inner + '\n' + indent, inner.length) : replace(inner)
    }
  }

  return replace('\n' + indent)
}

function selectedLineStarts(text: string, from: number, to: number): number[] {
  const lastPos = to > from && text[to - 1] === '\n' ? to - 1 : to

  const starts: number[] = []
  let lineStart = text.lastIndexOf('\n', from - 1) + 1
  for (;;) {
    starts.push(lineStart)
    const lineEnd = text.indexOf('\n', lineStart)
    if (lineEnd < 0 || lineEnd + 1 > lastPos) break
    lineStart = lineEnd + 1
  }
  return starts
}

export function indent(state: EditState): EditState | null {
  const { text } = state
  const lineStarts = selectedLineStarts(text, state.start, state.end)
    .filter((lineStart) => lineStart < text.length && text[lineStart] !== '\n')
  if (lineStarts.length === 0) return null

  let result = ''
  let copied = 0
  for (const lineStart of lineStarts) {
    result += text.slice(copied, lineStart) + INDENT
    copied = lineStart
  }
  result += text.slice(copied)

  const shifted = (position: number) => position + INDENT.length * lineStarts.filter((lineStart) => lineStart < position).length
  return { text: result, start: shifted(state.start), end: shifted(state.end) }
}

export function unindent(state: EditState): EditState | null {
  const { text } = state
  const removals: Array<[lineStart: number, count: number]> = []

  for (const lineStart of selectedLineStarts(text, state.start, state.end)) {
    let count = 0
    while (count < INDENT.length && text[lineStart + count] === ' ') count++
    if (count === 0 && text[lineStart] === '\t') count = 1
    if (count > 0) removals.push([lineStart, count])
  }
  if (removals.length === 0) return null

  let result = ''
  let copied = 0
  for (const [lineStart, count] of removals) {
    result += text.slice(copied, lineStart)
    copied = lineStart + count
  }
  result += text.slice(copied)

  const shifted = (position: number) =>
    position - removals.reduce((sum, [lineStart, count]) => sum + Math.max(0, Math.min(position - lineStart, count)), 0)
  return { text: result, start: shifted(state.start), end: shifted(state.end) }
}

export function tab(state: EditState, shift: boolean): EditState | null {
  if (shift) return unindent(state)
  if (state.start !== state.end) return indent(state)
  return caretState(state.text.slice(0, state.start) + INDENT + state.text.slice(state.end), state.start + INDENT.length)
}

function mapPosition(oldText: string, position: number, newText: string): number {
  if (position >= oldText.length) return newText.length

  let significant = 0
  for (let i = 0; i < position; i++) if (!isWhitespace(oldText[i])) significant++
  if (significant === 0) return 0

  let seen = 0
  for (let i = 0; i < newText.length; i++) {
    if (!isWhitespace(newText[i]) && ++seen === significant) return i + 1
  }
  return newText.length
}

export function applyLayout(state: EditState, layout: (text: string) => string): EditState | null {
  const text = layout(state.text)
  if (text === state.text) return null
  return { text, start: mapPosition(state.text, state.start, text), end: mapPosition(state.text, state.end, text) }
}
