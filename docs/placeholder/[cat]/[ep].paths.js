import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const list = JSON.parse(
  readFileSync(resolve(__dirname, '../../../data/placeholder-list-0.3.10.json'), 'utf-8')
)
const schema = JSON.parse(
  readFileSync(resolve(__dirname, '../../../data/placeholder-schema-0.3.10.json'), 'utf-8')
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

export default {
  paths() {
    return Object.entries(list).flatMap(([cat, endpoints]) =>
      endpoints.map((ep) => {
        const node = resolveSchema(schema, ep) ?? {}
        return {
          params: {
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
  }
}