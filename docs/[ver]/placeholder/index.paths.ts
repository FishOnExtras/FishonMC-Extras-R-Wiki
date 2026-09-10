import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

interface VersionsFile {
  versions: string[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../../data')

const versionsFile: VersionsFile = JSON.parse(
  readFileSync(resolve(dataDir, 'versions.json'), 'utf-8')
)

export default {
  paths() {
    return versionsFile.versions.map((ver) => ({
      params: { 
        ver,
        versions: versionsFile.versions ?? null
      }
    }))
  }
}