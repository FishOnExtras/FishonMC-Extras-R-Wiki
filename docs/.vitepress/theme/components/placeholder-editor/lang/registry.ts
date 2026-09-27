export interface PlaceholderParam {
  name: string
  type: string
  optional?: boolean
  variadic?: boolean
}

export interface PatternChild {
  kind: 'index' | 'string' | 'path'
  label: string
  node: PlaceholderNode
}

export interface PlaceholderNode {
  eval?: boolean
  resolver?: boolean
  description?: string
  returns?: string
  signature?: string
  params?: PlaceholderParam[]
  allowEmpty?: boolean
  children?: Record<string, PlaceholderNode>
  patterns?: PatternChild[]
}

export type PlaceholderRegistry = Record<string, PlaceholderNode>

const own = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key)

export function rootNode(registry: PlaceholderRegistry, name: string): PlaceholderNode | null {
  return own(registry, name) ? registry[name] : null
}

export function childNode(node: PlaceholderNode, name: string): PlaceholderNode | null {
  if (node.children && own(node.children, name)) return node.children[name]
  if (name === '' || !node.patterns) return null

  const isIndex = /^\d+$/.test(name)
  for (const kind of ['index', 'string', 'path'] as const) {
    if (kind === 'index' && !isIndex) continue
    const pattern = node.patterns.find((p) => p.kind === kind)
    if (pattern) return pattern.node
  }
  return null
}

export const hasEval = (node: PlaceholderNode): boolean => node.eval === true
export const hasResolver = (node: PlaceholderNode): boolean => node.resolver === true

export function formatParam(param: PlaceholderParam): string {
  return `${param.variadic ? '...' : ''}${param.name}${param.optional ? '?' : ''}: ${param.type}`
}
