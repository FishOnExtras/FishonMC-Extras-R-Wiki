import { tokenize, PlaceholderParseError, isWhitespace, type Token, type TokenType } from './tokenizer'

const INDENT = '  '

type FrameKind = 'BLOCK' | 'PATH_LT' | 'CALL' | 'GROUP'

interface Frame {
  kind: FrameKind
  segment: string
  expectOperand: boolean
  hasContent: boolean
}

const frame = (kind: FrameKind): Frame => ({ kind, segment: '', expectOperand: kind === 'CALL' || kind === 'GROUP', hasContent: false })
const isPath = (f: Frame) => f.kind === 'BLOCK' || f.kind === 'PATH_LT'
const isExpression = (f: Frame) => f.kind === 'CALL' || f.kind === 'GROUP'

class Layout {
  private readonly tokens: Token[]
  private out = ''
  private readonly stack: Frame[] = []
  private depth = 0
  private pendingBreak = false
  private sawWhitespace = false

  constructor(private readonly source: string, private readonly compact: boolean) {
    this.tokens = tokenize(source)
  }

  run(): string | null {
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i]
      if (token.type === 'EOF') break

      const top = this.top()

      if (!top) {
        if (token.type === 'PERCENT') {
          i = this.openBlock(i)
          if (i < 0) return null
        } else {
          this.out += this.raw(token)
        }
        continue
      }

      if (token.type === 'WHITESPACE') {
        if (isPath(top)) top.segment += this.raw(token)
        else this.sawWhitespace = true
        continue
      }

      if (isPath(top)) this.handlePath(top, token)
      else i = this.handleExpression(top, i)
      this.sawWhitespace = false
    }

    return this.stack.length === 0 ? this.out : null
  }

  private top(): Frame | undefined {
    return this.stack[this.stack.length - 1]
  }

  private openBlock(index: number): number {
    let close = -1
    for (let j = index + 1; j < this.tokens.length; j++) {
      const type = this.tokens[j].type
      if (type === 'LPAREN') break
      if (type === 'PERCENT') {
        close = j
        break
      }
      if (type === 'EOF') return -1
    }

    if (close >= 0) {
      if (!this.compact && this.out.endsWith('%')) this.out += '\n'
      this.out += this.source.substring(this.tokens[index].start, this.tokens[close].end)
      return close
    }

    if (!this.compact) this.startLine()
    this.out += '%'
    this.stack.push(frame('BLOCK'))
    this.pendingBreak = !this.compact
    return index
  }

  private handlePath(top: Frame, token: Token): void {
    switch (token.type) {
      case 'DOT':
        this.flushSegment(top)
        this.emit('.')
        break
      case 'LPAREN':
        this.flushSegment(top)
        this.emit('(')
        this.depth++
        this.pendingBreak = !this.compact
        this.stack.push(frame('CALL'))
        break
      case 'GT':
        if (top.kind === 'PATH_LT') {
          this.flushSegment(top)
          this.emit('>')
          this.stack.pop()
          const parent = this.top()
          if (parent && isExpression(parent)) parent.expectOperand = false
        } else {
          top.segment += this.raw(token)
        }
        break
      case 'PERCENT':
        if (this.stack.length === 1 && top.kind === 'BLOCK') {
          this.flushSegment(top)
          this.stack.pop()
          if (!this.compact) this.out += '\n'
          this.out += '%'
          this.pendingBreak = false
        } else {
          top.segment += this.raw(token)
        }
        break
      default:
        top.segment += this.raw(token)
    }
  }

  private handleExpression(top: Frame, index: number): number {
    const token = this.tokens[index]

    switch (token.type) {
      case 'LT':
        if (top.expectOperand) {
          this.emit('<')
          this.stack.push(frame('PATH_LT'))
        } else {
          index = this.operator(index, top)
        }
        break
      case 'GT': case 'PLUS': case 'MINUS': case 'STAR': case 'SLASH': case 'ASSIGN': case 'BANG':
        index = this.operator(index, top)
        break
      case 'COMMA':
        this.trimTrailingSpaces()
        this.emit(',')
        top.expectOperand = true
        if (!this.compact) {
          if (top.kind === 'CALL') this.pendingBreak = true
          else this.out += ' '
        }
        break
      case 'LPAREN':
        if (!top.expectOperand) this.separate()
        this.emit('(')
        this.stack.push(frame('GROUP'))
        break
      case 'RPAREN': {
        this.stack.pop()
        this.trimTrailingSpaces()
        if (top.kind === 'CALL') {
          this.depth--
          if (top.hasContent && !this.compact) this.out += '\n' + INDENT.repeat(this.depth + 1)
          this.out += ')'
          this.pendingBreak = false
        } else {
          this.emit(')')
        }
        const parent = this.top()
        if (parent && isExpression(parent)) parent.expectOperand = false
        break
      }
      case 'NUMBER': case 'STRING': case 'IDENTIFIER':
        if (!top.expectOperand) this.separate()
        this.emit(this.raw(token))
        top.expectOperand = false
        break
      default:
        this.separate()
        this.emit(this.raw(token))
    }

    return index
  }

  private operator(index: number, frame: Frame): number {
    const token = this.tokens[index]
    const type: TokenType = token.type
    let op = this.raw(token)

    if ((type === 'ASSIGN' || type === 'BANG' || type === 'LT' || type === 'GT') && index + 1 < this.tokens.length) {
      const next = this.tokens[index + 1]
      if (next.type === 'ASSIGN' && next.start === token.end) {
        op += this.raw(next)
        index++
      }
    }

    const spaced = !this.compact || op[0] === '<' || op[0] === '>'
    if (frame.expectOperand || !spaced) this.emit(op)
    else this.emit(' ' + op + ' ')
    frame.expectOperand = true
    return index
  }

  private startLine(): void {
    if (this.out.length > 0 && !this.out.endsWith('\n')) this.out += '\n'
  }

  private emit(text: string): void {
    if (this.pendingBreak) {
      this.out += '\n' + INDENT.repeat(this.depth + 1)
      this.pendingBreak = false
    }
    this.out += text

    const top = this.top()
    if (top && top.kind === 'CALL') top.hasContent = true
  }

  private flushSegment(f: Frame): void {
    const segment = f.segment.trim()
    f.segment = ''
    if (segment !== '') this.emit(segment)
  }

  private separate(): void {
    if (!this.sawWhitespace || this.pendingBreak || this.out.length === 0) return
    const last = this.out[this.out.length - 1]
    if (last !== ' ' && last !== '\n' && last !== '(') this.out += ' '
  }

  private trimTrailingSpaces(): void {
    let end = this.out.length
    while (end > 0 && this.out[end - 1] === ' ') end--
    this.out = this.out.substring(0, end)
  }

  private raw(token: Token): string {
    return this.source.substring(token.start, token.end)
  }
}

function sameSignificantChars(a: string, b: string): boolean {
  let i = 0
  let j = 0
  for (;;) {
    while (i < a.length && isWhitespace(a[i])) i++
    while (j < b.length && isWhitespace(b[j])) j++
    if (i === a.length || j === b.length) return i === a.length && j === b.length
    if (a[i++] !== b[j++]) return false
  }
}

function layout(source: string, compact: boolean): string | null {
  try {
    const result = new Layout(source, compact).run()
    return result !== null && sameSignificantChars(source, result) ? result : null
  } catch (e) {
    if (e instanceof PlaceholderParseError) return null
    throw e
  }
}

const withoutLineBreaks = (text: string) => (text.includes('\n') ? text.replace(/\n/g, '') : text)

export function format(text: string): string {
  return layout(withoutLineBreaks(text), false) ?? text
}

export function minify(text: string): string {
  const source = withoutLineBreaks(text)
  const result = layout(source, true)
  if (result === null) return text

  const expected = layout(source, false)
  const actual = layout(result, false)
  return expected !== null && expected === actual ? result : text
}
