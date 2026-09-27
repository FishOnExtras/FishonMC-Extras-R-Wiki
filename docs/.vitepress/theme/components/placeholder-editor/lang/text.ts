export interface StrippedText {
  readonly text: string
  readonly toRaw: readonly number[]
  toStripped(rawOffset: number): number
}

export function stripNewlines(raw: string): StrippedText {
  const toRaw: number[] = []
  const before: number[] = new Array(raw.length + 1)

  for (let i = 0; i < raw.length; i++) {
    before[i] = toRaw.length
    if (raw[i] !== '\n') toRaw.push(i)
  }
  before[raw.length] = toRaw.length
  toRaw.push(raw.length)

  return {
    text: raw.includes('\n') ? raw.replace(/\n/g, '') : raw,
    toRaw,
    toStripped: (rawOffset) => before[Math.max(0, Math.min(rawOffset, raw.length))],
  }
}
