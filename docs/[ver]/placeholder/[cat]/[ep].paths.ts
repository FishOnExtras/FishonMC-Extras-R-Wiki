import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

interface VersionEntry {
  version: string
  display: string
}

interface VersionsFile {
  versions: VersionEntry[]
}

type PlaceholderList = Record<string, string[]>

interface SchemaParam {
  name: string
  type: string
}

interface SchemaNode {
  signature?: string
  returns?: string
  description?: string
  params?: SchemaParam[]
  [key: string]: unknown
}

type SchemaTree = {
  [key: string]: SchemaTree | SchemaNode
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../../../data')

const versionsFile: VersionsFile = JSON.parse(
  readFileSync(resolve(dataDir, 'versions.json'), 'utf-8')
)

function resolveSchema(root: SchemaTree, ep: string): SchemaNode | undefined {
  const segments = ep.split('.').filter((seg) => seg !== '()')
  let node: SchemaTree | SchemaNode = root
  for (const seg of segments) {
    if (node == null) return undefined
    node = (node as SchemaTree)[seg] as SchemaTree | SchemaNode
  }
  return node as SchemaNode | undefined
}

function isFunctionCategory(endpoints: string[]): boolean {
  return endpoints.some((ep) => ep.includes('()'))
}

export default {
  paths() {
    return versionsFile.versions.flatMap(({ version, display }) => {
      const list: PlaceholderList = JSON.parse(
        readFileSync(resolve(dataDir, `placeholder-list-${version}.json`), 'utf-8')
      )
      const schema: SchemaTree = JSON.parse(
        readFileSync(resolve(dataDir, `placeholder-schema-${version}.json`), 'utf-8')
      )

      const sortedEntries = Object.entries(list).sort(([, a], [, b]) => {
        return Number(isFunctionCategory(a)) - Number(isFunctionCategory(b))
      })

      return sortedEntries.flatMap(([cat, endpoints]) =>
        endpoints.map((ep) => {
          const node = resolveSchema(schema, ep) ?? {}
          return {
            params: {
              ver: version,
              verDisplay: display,
              cat,
              ep: ep.replace(/</g, '[').replace(/>/g, ']'),
              rawEp: ep,
              signature: node.signature ?? null,
              returns: node.returns ?? null,
              description: node.description ?? null,
              paramsList: node.params ?? null,
              versions: versionsFile.versions ?? null
            }
          }
        })
      )
    })
  }
}