import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../../data')

const versionsFile = JSON.parse(
  readFileSync(resolve(dataDir, 'versions.json'), 'utf-8')
)

export default {
  paths() {
    return versionsFile.versions.map((ver) => ({
      params: { ver }
    }))
  }
}