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


const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../../data')

const versionsFile: VersionsFile = JSON.parse(
  readFileSync(resolve(dataDir, 'versions.json'), 'utf-8')
)

export default {
  paths() {
    return versionsFile.versions.map(({ version, display }) => ({
      params: { 
        ver: version,
        versions: versionsFile.versions ?? null,
        verDisplay: display,
      }
    }))
  }
}