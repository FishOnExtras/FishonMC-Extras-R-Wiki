import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../../../data')

const versionsFile = JSON.parse(
  readFileSync(resolve(dataDir, 'versions.json'), 'utf-8')
)

function resolveSchema(root, ep) {
  const segments = ep.split('.').filter((seg) => seg !== '()')
  let node = root
  for (const seg of segments) {
    if (node == null) return undefined
    node = node[seg]
  }
  return node
}

function isFunctionCategory(endpoints) {
  return endpoints.some((ep) => ep.includes('()'))
}

export default {
  paths() {
    return versionsFile.versions.flatMap((ver) => {
      const list = JSON.parse(
        readFileSync(resolve(dataDir, `placeholder-list-${ver}.json`), 'utf-8')
      )
      const schema = JSON.parse(
        readFileSync(resolve(dataDir, `placeholder-schema-${ver}.json`), 'utf-8')
      )

      const sortedEntries = Object.entries(list).sort(([, a], [, b]) => {
        return Number(isFunctionCategory(a)) - Number(isFunctionCategory(b))
      })

      return sortedEntries.flatMap(([cat, endpoints]) =>
        endpoints.map((ep) => {
          const node = resolveSchema(schema, ep) ?? {}
          return {
            params: {
              ver,
              cat,
              ep: ep.replace(/</g, '[').replace(/>/g, ']'),
              rawEp: ep,
              signature: node.signature ?? null,
              returns: node.returns ?? null,
              description: node.description ?? null,
              paramsList: node.params ?? null
            }
          }
        })
      )
    })
  }
}