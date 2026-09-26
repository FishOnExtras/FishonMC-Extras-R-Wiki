import type { PatternChild, PlaceholderNode, PlaceholderParam, PlaceholderRegistry } from './registry'

export type PlaceholderSchema = { [name: string]: unknown }

const META = new Set(['signature', 'returns', 'description', 'params', 'allow_empty'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const patternKind = (key: string): PatternChild['kind'] | null => {
  if (!/^<.*>$/.test(key)) return null
  if (key === '<index>') return 'index'
  if (key === '<string[]>') return 'path'
  return 'string'
}

function convertParams(raw: unknown): PlaceholderParam[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).map((p) => ({
    name: String(p.name),
    type: String(p.type ?? 'dynamic'),
    ...(p.optional === true ? { optional: true } : {}),
    ...(p.variadic === true ? { variadic: true } : {}),
  }))
}

function convert(raw: Record<string, unknown>): PlaceholderNode {
  const node: PlaceholderNode = {}

  if (typeof raw.returns === 'string') node.returns = raw.returns
  if (typeof raw.description === 'string') node.description = raw.description
  if (raw.allow_empty === true) node.allowEmpty = true

  if (typeof raw.signature === 'string') {
    node.eval = true
    node.signature = raw.signature
    node.params = convertParams(raw.params)
  } else if ('returns' in raw) {
    node.resolver = true
  }

  for (const [key, value] of Object.entries(raw)) {
    if (META.has(key) || !isRecord(value)) continue

    const child = convert(value)
    const kind = patternKind(key)
    if (kind === null) {
      ;(node.children ??= {})[key] = child
    } else {
      const pattern: PatternChild = { kind, label: key, node: child }
      if (kind === 'path') child.patterns = [...(child.patterns ?? []), pattern]
      ;(node.patterns ??= []).push(pattern)
    }
  }
  return node
}

export function fromSchema(schema: PlaceholderSchema): PlaceholderRegistry {
  const registry: PlaceholderRegistry = {}
  for (const [name, raw] of Object.entries(schema)) {
    if (isRecord(raw)) registry[name] = convert(raw)
  }
  return registry
}
