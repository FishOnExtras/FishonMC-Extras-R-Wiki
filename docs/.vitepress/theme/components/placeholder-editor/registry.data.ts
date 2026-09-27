import { defineLoader } from 'vitepress'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RegistryData {
  version: string
  display: string
  schema: Record<string, unknown>
}

declare const data: RegistryData
export { data }

function findDataDir(): string {
  const starts = [dirname(fileURLToPath(import.meta.url)), process.cwd()]
  for (const start of starts) {
    for (let dir = resolve(start); ; dir = dirname(dir)) {
      if (existsSync(join(dir, 'data', 'versions.json'))) return join(dir, 'data')
      if (dirname(dir) === dir) break
    }
  }
  throw new Error('Could not find data/versions.json above ' + starts.join(' or '))
}

const dataDir = findDataDir()

export default defineLoader({
  watch: [join(dataDir, '*.json').replaceAll('\\', '/')],
  load(): RegistryData {
    const { versions } = JSON.parse(readFileSync(join(dataDir, 'versions.json'), 'utf8')) as {
      versions: Array<{ version: string; display?: string }>
    }
    const latest = versions[0]
    if (!latest) throw new Error('data/versions.json lists no versions')

    const names = [latest.version, latest.version.replaceAll('.', '_')].map((v) => join(dataDir, `placeholder-schema-${v}.json`))
    const file = names.find((name) => existsSync(name))
    if (!file) throw new Error(`Missing ${names[0]}`)

    return { version: latest.version, display: latest.display ?? latest.version, schema: JSON.parse(readFileSync(file, 'utf8')) }
  },
})
