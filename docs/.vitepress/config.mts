import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { defineConfig } from 'vitepress'

interface VersionEntry {
  version: string
  display: string
}

interface VersionsFile {
  versions: VersionEntry[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../data')

const versionsFile: VersionsFile = JSON.parse(
  readFileSync(resolve(dataDir, 'versions.json'), 'utf-8')
)
const versions = versionsFile.versions

function isFunctionCategory(endpoints: string[]) {
  return endpoints.some((ep) => ep.includes('()'))
}

function buildSidebarForVersion({ version }: VersionEntry) {
  const list = JSON.parse(
    readFileSync(resolve(dataDir, `placeholder-list-${version}.json`), 'utf-8')
  )

  const sortedEntries = Object.entries(list).sort(([, a], [, b]) => {
    return Number(isFunctionCategory(a as string[])) - Number(isFunctionCategory(b as string[]))
  })

  return sortedEntries.map(([cat, endpoints]) => ({
    text: cat,
    collapsed: true,
    items: (endpoints as string[]).map((ep) => {
      const display = ep.replace(/</g, '[').replace(/>/g, ']')
      return {
        text: display,
        link: `/${version}/placeholder/${cat}/${display}/`
      }
    })
  }))
}

function buildAllSidebars() {
  const sidebar: Record<string, any> = {}
  for (const entry of versions) {
    sidebar[`/${entry.version}/placeholder/`] = buildSidebarForVersion(entry)
  }
  return sidebar
}

export default defineConfig({
  srcExclude: [],

  base: "/FishonMC-Extras-R-Wiki/",

  title: "FishOnMC Extras R Wiki",
  description: "Wiki for the FishOnMC Extras R (FOER) mod",

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/FishonMC-Extras-R-Wiki/icon.png' }],
    ['link', { rel: 'icon', href: '/FishonMC-Extras-R-Wiki/icon.ico' }]
  ],

  cleanUrls: true,

  themeConfig: {
    siteTitle: "FOER Wiki",

    logo: {
      src: '/icon.png',
      width: 24,
      height: 24
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Creator', items: [
        { text: 'Overview', link: '/creator/' }
      ]},
      {
        text: 'Placeholder',
        items: [
          { text: 'Editor', link: '/editor/' },
          ...versions.map(({ version, display }) => ({
            text: display,
            link: `/${version}/placeholder/`
          }))
        ]
      },
      { text: 'Search', link: '/search/' },
      { text: `Download`, link: 'https://modrinth.com/mod/fishonmc-extras-r' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/orgs/FishOnExtras/repositories' }
    ],

    sidebar: {
      ...buildAllSidebars(),
      '/creator/': [
        {
          text: 'Creator',
          items: [
            { text: 'Overview', link: '/creator/' }
          ]
        }
      ]
    },

    footer: {
      message: '<b>FishOnMC-Extras-R-Wiki</b> is not affiliated, associated, authorized, endorsed by, or in any way officially connected with <a href="https://fishonmc.net/">FishOnMC</a><br /><i>Made by DannyPX</i>'
    },

    docFooter: {
      prev: false,
      next: false
    }
  },

  transformPageData(pageData) {
    if (pageData.params?.rawEp) {
      pageData.title = pageData.params.cat
    }

    if (pageData.frontmatter.layout === 'home') {
      const latest = versionsFile.versions[0].version
      pageData.frontmatter.hero.actions[1].link = `/${latest}/placeholder/`
    }
  }
});
