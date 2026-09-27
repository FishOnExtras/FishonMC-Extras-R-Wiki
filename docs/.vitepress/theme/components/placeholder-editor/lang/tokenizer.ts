export type TokenType =
  | 'PERCENT' | 'IDENTIFIER' | 'DOT' | 'LPAREN' | 'RPAREN' | 'COMMA'
  | 'LT' | 'GT' | 'ASSIGN' | 'BANG'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH'
  | 'NUMBER' | 'LITERAL' | 'ESCAPED_LITERAL' | 'STRING' | 'WHITESPACE'
  | 'EOF'

export interface Token {
  readonly type: TokenType
  readonly text: string
  readonly start: number
  readonly end: number
}

export class PlaceholderParseError extends Error {
  readonly position: number

  constructor(message: string, position: number) {
    super(message)
    this.name = 'PlaceholderParseError'
    this.position = position
  }
}

const FIXED: Record<string, TokenType> = {
  '<': 'LT', '>': 'GT', '=': 'ASSIGN', '!': 'BANG',
  '%': 'PERCENT', '.': 'DOT', '(': 'LPAREN', ')': 'RPAREN', ',': 'COMMA',
  '+': 'PLUS', '-': 'MINUS', '*': 'STAR', '/': 'SLASH',
}

const NOT_WHITESPACE = new Set(['\u00a0', '\u2007', '\u202f', '\ufeff'])
export const isWhitespace = (c: string): boolean => c.length === 1 && /\s/.test(c) && !NOT_WHITESPACE.has(c)
const isDigit = (c: string): boolean => /^\p{Nd}$/u.test(c)
const isLetter = (c: string): boolean => /^\p{L}$/u.test(c)
const isIdentStart = (c: string): boolean => isLetter(c) || c === '_'
const isIdentPart = (c: string): boolean => isLetter(c) || isDigit(c) || c === '_'
const startsToken = (c: string): boolean => c === '%' || c === '<' || c === '>' || c === '\\' || c === '"' || isWhitespace(c)

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  const atEnd = () => pos >= source.length
  const peek = (offset = 0) => (pos + offset < source.length ? source[pos + offset] : '\0')
  const hasNext = (offset: number) => pos + offset < source.length
  const token = (type: TokenType, text: string, start: number): Token => ({ type, text, start, end: pos })

  const scanWhitespace = (): Token => {
    const start = pos
    while (!atEnd() && isWhitespace(peek())) pos++
    return token('WHITESPACE', source.substring(start, pos), start)
  }

  const scanQuotedString = (): Token => {
    const start = pos
    pos++
    let text = ''
    while (!atEnd() && peek() !== '"') {
      if (peek() === '\\' && peek(1) === '"') {
        text += '"'
        pos += 2
      } else {
        text += peek()
        pos++
      }
    }
    if (atEnd()) throw new PlaceholderParseError(`Unterminated string literal starting at position ${start}`, start)
    pos++
    return token('STRING', text, start)
  }

  const scanNumber = (): Token => {
    const start = pos
    while (!atEnd() && isDigit(peek())) pos++
    if (!atEnd() && peek() === '.' && hasNext(1) && isDigit(peek(1))) {
      pos++
      while (!atEnd() && isDigit(peek())) pos++
    }
    return token('NUMBER', source.substring(start, pos), start)
  }

  const scanIdentifier = (): Token => {
    const start = pos
    while (!atEnd() && isIdentPart(peek())) pos++
    return token('IDENTIFIER', source.substring(start, pos), start)
  }

  const scanLiteralRun = (): Token => {
    const start = pos
    while (!atEnd() && !startsToken(peek())) pos++
    if (pos === start) pos++ 
    return token('LITERAL', source.substring(start, pos), start)
  }

  const next = (): Token => {
    if (atEnd()) return token('EOF', '', pos)

    const c = peek()
    if (isWhitespace(c)) return scanWhitespace()
    if (c === '"') return scanQuotedString()

    const fixed = FIXED[c]
    if (fixed) {
      pos++
      return token(fixed, c, pos - 1)
    }

    if (c === '\\' && hasNext(1)) {
      const start = pos
      const literal = peek(1)
      pos += 2
      return token('ESCAPED_LITERAL', literal, start)
    }

    if (isDigit(c)) return scanNumber()
    if (isIdentStart(c)) return scanIdentifier()
    return scanLiteralRun()
  }

  let t: Token
  do {
    t = next()
    tokens.push(t)
  } while (t.type !== 'EOF')
  return tokens
}
